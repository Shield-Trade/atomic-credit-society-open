import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { db, saveDb } from "../store/db";
import type { SettlementAsset, Wallet, WalletAccount, WalletPolicy } from "../types/domain";
import { AppError } from "../utils/app-error";

export const SUPPORTED_ASSETS: SettlementAsset[] = ["USDT", "USAT", "XAUT", "BTC"];

const DEFAULT_AGENT_POLICY: WalletPolicy = {
  maxTransferPerTx: 5_000,
  allowedAssets: [...SUPPORTED_ASSETS]
};

const TREASURY_POLICY: WalletPolicy = {
  maxTransferPerTx: 1_000_000,
  allowedAssets: [...SUPPORTED_ASSETS]
};

function buildEmptyBalances() {
  return {
    USDT: 0,
    USAT: 0,
    XAUT: 0,
    BTC: 0
  };
}

function normalizeAsset(asset?: string): SettlementAsset {
  const value = (asset ?? env.settlementAsset).toUpperCase();
  if (value === "USDT" || value === "USAT" || value === "XAUT" || value === "BTC") {
    return value;
  }

  throw new AppError("Unsupported settlement asset.", {
    code: ERROR_CODES.ASSET_NOT_SUPPORTED,
    status: 400
  });
}

function ensureWallet(address: string) {
  const wallet = db.wallets.find((item) => item.address === address);
  if (!wallet) {
    throw new AppError("Wallet not found.", {
      code: ERROR_CODES.WALLET_NOT_FOUND,
      status: 404
    });
  }
  return wallet;
}

function ensurePolicy(walletAddress: string, policy: WalletPolicy) {
  if (policy.maxTransferPerTx <= 0) {
    throw new AppError("maxTransferPerTx must be positive.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  if (policy.allowedAssets.length === 0) {
    throw new AppError("allowedAssets cannot be empty.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  for (const item of policy.allowedAssets) {
    normalizeAsset(item);
  }

  const wallet = ensureWallet(walletAddress);
  wallet.policy = {
    maxTransferPerTx: policy.maxTransferPerTx,
    allowedAssets: [...policy.allowedAssets]
  };
  wallet.updatedAt = new Date().toISOString();
  saveDb();
}

function buildAccount(walletAddress: string, asset: SettlementAsset): WalletAccount {
  return {
    id: "acct_" + uuidv4(),
    walletAddress,
    asset,
    createdAt: new Date().toISOString()
  };
}

function syncLegacyBalance(wallet: { balance: number; balances: Record<SettlementAsset, number> }) {
  wallet.balance = wallet.balances[env.settlementAsset];
}

function findOrCreateAccount(walletAddress: string, asset: SettlementAsset) {
  const wallet = ensureWallet(walletAddress);
  const existing = wallet.accounts.find((item) => item.asset === asset);
  if (existing) {
    return existing;
  }

  const account = buildAccount(walletAddress, asset);
  wallet.accounts.push(account);
  wallet.updatedAt = new Date().toISOString();
  saveDb();
  return account;
}

function assertPositiveAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Transfer amount must be positive.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }
}

function toAtomicUnits(amount: number, decimals: number): bigint {
  const fixed = amount.toFixed(decimals);
  const [wholeRaw, fractionalRaw = ""] = fixed.split(".");
  const whole = wholeRaw.startsWith("-") ? wholeRaw.slice(1) : wholeRaw;
  const sign = wholeRaw.startsWith("-") ? -1n : 1n;
  const encoded = (whole + fractionalRaw.padEnd(decimals, "0")).replace(/^0+(?=\d)/, "");
  const value = BigInt(encoded.length > 0 ? encoded : "0");
  return sign * value;
}

function fromAtomicUnits(value: bigint, decimals: number): number {
  const sign = value < 0n ? -1 : 1;
  const abs = value < 0n ? -value : value;
  const factor = 10n ** BigInt(decimals);
  const whole = abs / factor;
  const remainder = abs % factor;
  if (remainder === 0n) {
    return Number(whole) * sign;
  }

  const fractional = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  const rendered = `${whole.toString()}.${fractional}`;
  return Number(rendered) * sign;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientRpcError(error: unknown) {
  const rendered =
    typeof error === "object" && error !== null
      ? JSON.stringify(error)
      : String(error ?? "");

  return (
    rendered.includes("Too Many Requests") ||
    rendered.includes("\"code\":-32005") ||
    rendered.includes("missing response for request") ||
    rendered.includes("JsonRpcProvider failed to detect network")
  );
}

export interface WalletTransferInput {
  fromAddress: string;
  toAddress: string;
  amount: number;
  asset?: SettlementAsset;
  initiatedBy?: "agent" | "system";
}

export interface WalletTransferResult {
  transactionId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  asset: SettlementAsset;
  signature: string;
  onChainTxHash: string;
  timestamp: string;
}

export interface CreditTokenTransferResult {
  transferId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  reason: string;
  timestamp: string;
}

export interface WdkProvider {
  getSupportedAssets(): SettlementAsset[];
  createWallet(
    ownerAgentId: string | null,
    initialBalance?: number,
    initialAsset?: SettlementAsset,
    initialCreditTokenBalance?: number
  ): Promise<{
    address: string;
    ownerAgentId: string | null;
    balance: number;
    creditTokenBalance: number;
    balances: Record<SettlementAsset, number>;
    accounts: WalletAccount[];
    policy: WalletPolicy;
    provider?: "mock" | "wdk-evm";
    wdk?: {
      chain: "evm";
      seedPhrase: string;
      accountIndex: number;
    } | null;
    createdAt: string;
    updatedAt: string;
  }>;
  createAccount(walletAddress: string, asset: SettlementAsset): Promise<WalletAccount>;
  getAccounts(walletAddress: string): Promise<WalletAccount[]>;
  updatePolicy(walletAddress: string, policy: WalletPolicy): Promise<WalletPolicy>;
  getCreditTokenBalance(address: string): Promise<number>;
  transferCreditToken(input: {
    fromAddress: string;
    toAddress: string;
    amount: number;
    reason?: string;
  }): Promise<CreditTokenTransferResult>;
  getBalance(address: string, asset?: SettlementAsset): Promise<number>;
  signTransaction(payload: WalletTransferInput): Promise<{ signature: string; signedAt: string }>;
  sendTransaction(input: WalletTransferInput): Promise<WalletTransferResult>;
  listTransactions(params?: { walletAddress?: string; asset?: SettlementAsset; limit?: number }): Promise<
    Array<{
      id: string;
      fromAddress: string;
      toAddress: string;
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      asset: SettlementAsset;
      signature: string;
      onChainTxHash: string;
      initiatedBy: "agent" | "system";
      timestamp: string;
    }>
  >;
}

class MockWdkProvider implements WdkProvider {
  getSupportedAssets() {
    return [...SUPPORTED_ASSETS];
  }

  async createWallet(
    ownerAgentId: string | null,
    initialBalance?: number,
    initialAsset?: SettlementAsset,
    initialCreditTokenBalance?: number
  ) {
    const seedAsset = normalizeAsset(initialAsset);
    const balances = buildEmptyBalances();
    balances[seedAsset] = typeof initialBalance === "number" ? initialBalance : 0;
    const creditTokenBalance =
      typeof initialCreditTokenBalance === "number"
        ? initialCreditTokenBalance
        : ownerAgentId
          ? 50
          : 0;

    const wallet: Wallet = {
      address: "wdk_" + uuidv4().replace(/-/g, "").slice(0, 24),
      ownerAgentId,
      balance: 0,
      creditTokenBalance,
      balances,
      accounts: [],
      policy: ownerAgentId ? { ...DEFAULT_AGENT_POLICY } : { ...TREASURY_POLICY },
      provider: "mock",
      wdk: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    wallet.accounts.push(buildAccount(wallet.address, seedAsset));
    syncLegacyBalance(wallet);
    db.wallets.push(wallet);
    saveDb();

    return wallet;
  }

  async createAccount(walletAddress: string, asset: SettlementAsset) {
    const normalized = normalizeAsset(asset);
    return findOrCreateAccount(walletAddress, normalized);
  }

  async getAccounts(walletAddress: string) {
    const wallet = ensureWallet(walletAddress);
    return [...wallet.accounts];
  }

  async getCreditTokenBalance(address: string) {
    const wallet = ensureWallet(address);
    return wallet.creditTokenBalance;
  }

  async transferCreditToken(input: {
    fromAddress: string;
    toAddress: string;
    amount: number;
    reason?: string;
  }): Promise<CreditTokenTransferResult> {
    const fromWallet = ensureWallet(input.fromAddress);
    const toWallet = ensureWallet(input.toAddress);

    assertPositiveAmount(input.amount);

    if (fromWallet.creditTokenBalance < input.amount) {
      throw new AppError("Insufficient credit token balance.", {
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
        status: 400
      });
    }

    fromWallet.creditTokenBalance = Number((fromWallet.creditTokenBalance - input.amount).toFixed(2));
    toWallet.creditTokenBalance = Number((toWallet.creditTokenBalance + input.amount).toFixed(2));
    fromWallet.updatedAt = new Date().toISOString();
    toWallet.updatedAt = new Date().toISOString();

    const record = {
      id: "ctx_" + uuidv4(),
      fromAddress: fromWallet.address,
      toAddress: toWallet.address,
      amount: Number(input.amount.toFixed(2)),
      reason: input.reason ?? "credit-token-transfer",
      timestamp: new Date().toISOString()
    };

    db.creditTokenTransactions.push(record);
    saveDb();

    return {
      transferId: record.id,
      fromAddress: record.fromAddress,
      toAddress: record.toAddress,
      amount: record.amount,
      reason: record.reason,
      timestamp: record.timestamp
    };
  }

  async updatePolicy(walletAddress: string, policy: WalletPolicy) {
    ensurePolicy(walletAddress, policy);
    return ensureWallet(walletAddress).policy;
  }

  async getBalance(address: string, asset?: SettlementAsset) {
    const wallet = ensureWallet(address);
    const normalized = normalizeAsset(asset);
    return wallet.balances[normalized];
  }

  async signTransaction(payload: WalletTransferInput) {
    const normalizedAsset = normalizeAsset(payload.asset);
    const signPayload = {
      fromAddress: payload.fromAddress,
      toAddress: payload.toAddress,
      amount: payload.amount,
      asset: normalizedAsset,
      signedAt: new Date().toISOString()
    };

    return {
      signature: "sig_" + Buffer.from(JSON.stringify(signPayload)).toString("base64url").slice(0, 36),
      signedAt: signPayload.signedAt
    };
  }

  async sendTransaction(input: WalletTransferInput): Promise<WalletTransferResult> {
    const fromWallet = ensureWallet(input.fromAddress);
    const toWallet = ensureWallet(input.toAddress);
    const asset = normalizeAsset(input.asset);

    assertPositiveAmount(input.amount);

    if (!fromWallet.policy.allowedAssets.includes(asset)) {
      throw new AppError("Asset transfer blocked by wallet policy.", {
        code: ERROR_CODES.POLICY_VIOLATION,
        status: 403
      });
    }

    if (input.amount > fromWallet.policy.maxTransferPerTx) {
      throw new AppError("Transfer amount exceeds wallet policy limit.", {
        code: ERROR_CODES.POLICY_VIOLATION,
        status: 403
      });
    }

    if (fromWallet.balances[asset] < input.amount) {
      throw new AppError("Insufficient balance for transfer.", {
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
        status: 400
      });
    }

    const fromAccount = findOrCreateAccount(input.fromAddress, asset);
    const toAccount = findOrCreateAccount(input.toAddress, asset);
    const signed = await this.signTransaction(input);

    fromWallet.balances[asset] -= input.amount;
    toWallet.balances[asset] += input.amount;
    fromWallet.updatedAt = new Date().toISOString();
    toWallet.updatedAt = new Date().toISOString();
    syncLegacyBalance(fromWallet);
    syncLegacyBalance(toWallet);

    const txId = "tx_" + uuidv4();
    const tx = {
      id: txId,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      amount: input.amount,
      asset,
      signature: signed.signature,
      onChainTxHash: "chain_" + uuidv4().replace(/-/g, ""),
      initiatedBy: input.initiatedBy ?? "agent",
      timestamp: new Date().toISOString()
    };

    db.walletTransactions.push(tx);
    saveDb();

    return {
      transactionId: tx.id,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      amount: tx.amount,
      asset: tx.asset,
      signature: tx.signature,
      onChainTxHash: tx.onChainTxHash,
      timestamp: tx.timestamp
    };
  }

  async listTransactions(params?: {
    walletAddress?: string;
    asset?: SettlementAsset;
    limit?: number;
  }) {
    const asset = params?.asset ? normalizeAsset(params.asset) : null;
    const walletAddress = params?.walletAddress;
    const limit = params?.limit ?? 100;

    return db.walletTransactions
      .filter((item) => {
        const byWallet =
          !walletAddress || item.fromAddress === walletAddress || item.toAddress === walletAddress;
        const byAsset = !asset || item.asset === asset;
        return byWallet && byAsset;
      })
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, limit);
  }
}

type WalletManagerEvmCtor = (new (
  seed: string | Uint8Array,
  config?: { provider?: string; transferMaxFee?: number | bigint }
) => {
  getAccount(index?: number): Promise<{
    getAddress(): Promise<string>;
    sign(message: string): Promise<string>;
    transfer(options: { token: string; recipient: string; amount: number | bigint }): Promise<{ hash: string; fee: bigint }>;
    dispose(): void;
  }>;
  dispose(): void;
}) & {
  getRandomSeedPhrase?(wordCount?: 12 | 24): string;
};

type WalletAccountReadOnlyEvmCtor = new (
  address: string,
  config?: { provider?: string }
) => {
  getTokenBalance(tokenAddress: string): Promise<bigint>;
};

let walletManagerEvmPromise: Promise<WalletManagerEvmCtor> | null = null;
let walletAccountReadOnlyEvmPromise: Promise<WalletAccountReadOnlyEvmCtor> | null = null;

async function loadWalletManagerEvm(): Promise<WalletManagerEvmCtor> {
  if (!walletManagerEvmPromise) {
    walletManagerEvmPromise = import("@tetherto/wdk-wallet-evm").then((module) => {
      const ctor = module.default as unknown as WalletManagerEvmCtor;
      if (!ctor) {
        throw new AppError("Failed to load WDK WalletManagerEvm.", {
          code: ERROR_CODES.INTERNAL_ERROR,
          status: 500
        });
      }
      return ctor;
    });
  }
  return walletManagerEvmPromise;
}

async function loadWalletAccountReadOnlyEvm(): Promise<WalletAccountReadOnlyEvmCtor> {
  if (!walletAccountReadOnlyEvmPromise) {
    walletAccountReadOnlyEvmPromise = import("@tetherto/wdk-wallet-evm").then((module) => {
      const ctor = module.WalletAccountReadOnlyEvm as unknown as WalletAccountReadOnlyEvmCtor;
      if (!ctor) {
        throw new AppError("Failed to load WDK WalletAccountReadOnlyEvm.", {
          code: ERROR_CODES.INTERNAL_ERROR,
          status: 500
        });
      }
      return ctor;
    });
  }
  return walletAccountReadOnlyEvmPromise;
}

class RealWdkProvider implements WdkProvider {
  constructor(private readonly fallback: MockWdkProvider) {}

  private ensureConfigured() {
    if (!env.wdkEvmRpcUrl) {
      throw new AppError("WDK real provider requires WDK_EVM_RPC_URL.", {
        code: ERROR_CODES.BAD_REQUEST,
        status: 500
      });
    }

    return {
      rpcUrl: env.wdkEvmRpcUrl,
      transferMaxFeeWei: env.wdkEvmTransferMaxFeeWei ? BigInt(env.wdkEvmTransferMaxFeeWei) : undefined
    };
  }

  private getDecimals(asset: SettlementAsset) {
    if (asset === "USDT") {
      return env.wdkEvmDecimalsUsdt;
    }
    if (asset === "USAT") {
      return env.wdkEvmDecimalsUsat;
    }
    if (asset === "XAUT") {
      return env.wdkEvmDecimalsXaut;
    }
    throw new AppError("BTC is not supported by EVM WDK provider. Configure a BTC provider for BTC settlements.", {
      code: ERROR_CODES.ASSET_NOT_SUPPORTED,
      status: 400
    });
  }

  private getTokenAddress(asset: SettlementAsset) {
    if (asset === "USDT") {
      if (!env.wdkEvmTokenUsdt) {
        throw new AppError("Missing WDK_EVM_TOKEN_USDT for real WDK provider.", {
          code: ERROR_CODES.BAD_REQUEST,
          status: 500
        });
      }
      return env.wdkEvmTokenUsdt;
    }

    if (asset === "USAT") {
      if (!env.wdkEvmTokenUsat) {
        throw new AppError("Missing WDK_EVM_TOKEN_USAT for real WDK provider.", {
          code: ERROR_CODES.BAD_REQUEST,
          status: 500
        });
      }
      return env.wdkEvmTokenUsat;
    }

    if (asset === "XAUT") {
      if (!env.wdkEvmTokenXaut) {
        throw new AppError("Missing WDK_EVM_TOKEN_XAUT for real WDK provider.", {
          code: ERROR_CODES.BAD_REQUEST,
          status: 500
        });
      }
      return env.wdkEvmTokenXaut;
    }

    throw new AppError("BTC is not supported by EVM WDK provider. Configure a BTC provider for BTC settlements.", {
      code: ERROR_CODES.ASSET_NOT_SUPPORTED,
      status: 400
    });
  }

  private async randomSeedPhrase() {
    const WalletManagerEvm = await loadWalletManagerEvm();
    if (typeof WalletManagerEvm.getRandomSeedPhrase === "function") {
      return WalletManagerEvm.getRandomSeedPhrase(12);
    }

    throw new AppError("WDK WalletManagerEvm does not expose seed generation.", {
      code: ERROR_CODES.INTERNAL_ERROR,
      status: 500
    });
  }

  private newWalletManager(seedPhrase: string) {
    const config = this.ensureConfigured();
    return loadWalletManagerEvm().then((WalletManagerEvm) => {
      return new WalletManagerEvm(seedPhrase, {
        provider: config.rpcUrl,
        transferMaxFee: config.transferMaxFeeWei
      });
    });
  }

  private async deriveAddress(seedPhrase: string, accountIndex: number) {
    const manager = await this.newWalletManager(seedPhrase);
    try {
      const account = await manager.getAccount(accountIndex);
      const address = await account.getAddress();
      account.dispose();
      return address;
    } finally {
      manager.dispose();
    }
  }

  private async readOnChainTokenBalance(walletAddress: string, asset: SettlementAsset) {
    const config = this.ensureConfigured();
    const tokenAddress = this.getTokenAddress(asset);
    const decimals = this.getDecimals(asset);
    const ReadOnlyAccount = await loadWalletAccountReadOnlyEvm();
    const account = new ReadOnlyAccount(walletAddress, { provider: config.rpcUrl });
    const raw = await account.getTokenBalance(tokenAddress);
    return fromAtomicUnits(raw, decimals);
  }

  private async withWritableAccount(wallet: Wallet) {
    const canonicalWallet = await this.ensureEvmWallet(wallet);

    const manager = await this.newWalletManager(canonicalWallet.wdk!.seedPhrase);
    const account = await manager.getAccount(canonicalWallet.wdk!.accountIndex);
    return {
      manager,
      account,
      wallet: canonicalWallet
    };
  }

  private async ensureEvmWallet(wallet: Wallet) {
    if (wallet.provider === "wdk-evm" && wallet.wdk?.chain === "evm" && wallet.address.startsWith("0x")) {
      return wallet;
    }

    const previousAddress = wallet.address;
    const seedPhrase =
      wallet.ownerAgentId === null && env.wdkRealTreasurySeedPhrase
        ? env.wdkRealTreasurySeedPhrase
        : await this.randomSeedPhrase();
    const migratedAddress = await this.deriveAddress(seedPhrase, 0);

    const collision = db.wallets.find((item) => item.address === migratedAddress && item !== wallet);
    if (collision) {
      throw new AppError("Wallet migration produced duplicate EVM address.", {
        code: ERROR_CODES.INTERNAL_ERROR,
        status: 500
      });
    }

    wallet.address = migratedAddress;
    wallet.provider = "wdk-evm";
    wallet.creditTokenBalance = typeof wallet.creditTokenBalance === "number" ? wallet.creditTokenBalance : wallet.ownerAgentId ? 50 : 0;
    wallet.wdk = {
      chain: "evm",
      seedPhrase,
      accountIndex: 0
    };
    wallet.accounts = wallet.accounts.map((account) => ({
      ...account,
      walletAddress: migratedAddress
    }));
    wallet.updatedAt = new Date().toISOString();

    for (const agent of db.agents) {
      if (agent.walletAddress === previousAddress) {
        agent.walletAddress = migratedAddress;
      }
    }

    for (const transaction of db.walletTransactions) {
      if (transaction.fromAddress === previousAddress) {
        transaction.fromAddress = migratedAddress;
      }
      if (transaction.toAddress === previousAddress) {
        transaction.toAddress = migratedAddress;
      }
    }

    saveDb();
    return wallet;
  }

  getSupportedAssets() {
    return [...SUPPORTED_ASSETS];
  }

  async createWallet(
    ownerAgentId: string | null,
    _initialBalance?: number,
    initialAsset?: SettlementAsset,
    initialCreditTokenBalance?: number
  ) {
    const seedAsset = normalizeAsset(initialAsset);
    const balances = buildEmptyBalances();
    const creditTokenBalance =
      typeof initialCreditTokenBalance === "number"
        ? initialCreditTokenBalance
        : ownerAgentId
          ? 50
          : 0;

    const seedPhrase = ownerAgentId === null && env.wdkRealTreasurySeedPhrase
      ? env.wdkRealTreasurySeedPhrase
      : await this.randomSeedPhrase();

    const address = await this.deriveAddress(seedPhrase, 0);

    const wallet: Wallet = {
      address,
      ownerAgentId,
      balance: 0,
      creditTokenBalance,
      balances,
      accounts: [],
      policy: ownerAgentId ? { ...DEFAULT_AGENT_POLICY } : { ...TREASURY_POLICY },
      provider: "wdk-evm",
      wdk: {
        chain: "evm",
        seedPhrase,
        accountIndex: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    wallet.accounts.push(buildAccount(wallet.address, seedAsset));
    syncLegacyBalance(wallet);
    db.wallets.push(wallet);
    saveDb();

    return wallet;
  }

  async createAccount(walletAddress: string, asset: SettlementAsset) {
    const normalized = normalizeAsset(asset);
    const wallet = await this.ensureEvmWallet(ensureWallet(walletAddress));
    return findOrCreateAccount(wallet.address, normalized);
  }

  async getAccounts(walletAddress: string) {
    const wallet = await this.ensureEvmWallet(ensureWallet(walletAddress));
    return [...wallet.accounts];
  }

  async getCreditTokenBalance(address: string) {
    const wallet = await this.ensureEvmWallet(ensureWallet(address));
    return wallet.creditTokenBalance;
  }

  async transferCreditToken(input: {
    fromAddress: string;
    toAddress: string;
    amount: number;
    reason?: string;
  }): Promise<CreditTokenTransferResult> {
    const fromWallet = await this.ensureEvmWallet(ensureWallet(input.fromAddress));
    const toWallet = await this.ensureEvmWallet(ensureWallet(input.toAddress));

    assertPositiveAmount(input.amount);

    if (fromWallet.creditTokenBalance < input.amount) {
      throw new AppError("Insufficient credit token balance.", {
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
        status: 400
      });
    }

    fromWallet.creditTokenBalance = Number((fromWallet.creditTokenBalance - input.amount).toFixed(2));
    toWallet.creditTokenBalance = Number((toWallet.creditTokenBalance + input.amount).toFixed(2));
    fromWallet.updatedAt = new Date().toISOString();
    toWallet.updatedAt = new Date().toISOString();

    const record = {
      id: "ctx_" + uuidv4(),
      fromAddress: fromWallet.address,
      toAddress: toWallet.address,
      amount: Number(input.amount.toFixed(2)),
      reason: input.reason ?? "credit-token-transfer",
      timestamp: new Date().toISOString()
    };

    db.creditTokenTransactions.push(record);
    saveDb();

    return {
      transferId: record.id,
      fromAddress: record.fromAddress,
      toAddress: record.toAddress,
      amount: record.amount,
      reason: record.reason,
      timestamp: record.timestamp
    };
  }

  async updatePolicy(walletAddress: string, policy: WalletPolicy) {
    const wallet = await this.ensureEvmWallet(ensureWallet(walletAddress));
    ensurePolicy(wallet.address, policy);
    return ensureWallet(wallet.address).policy;
  }

  async getBalance(address: string, asset?: SettlementAsset) {
    const wallet = await this.ensureEvmWallet(ensureWallet(address));
    const normalized = normalizeAsset(asset);

    if (normalized === "BTC") {
      throw new AppError("BTC balance read is not available in EVM WDK mode.", {
        code: ERROR_CODES.ASSET_NOT_SUPPORTED,
        status: 400
      });
    }

    const cached = wallet.balances[normalized];
    const cacheTtlMsRaw = Number(process.env.WDK_EVM_BALANCE_CACHE_MS ?? "15000");
    const cacheTtlMs = Number.isFinite(cacheTtlMsRaw) && cacheTtlMsRaw >= 0 ? cacheTtlMsRaw : 15000;
    const updatedAtMs = new Date(wallet.updatedAt).getTime();
    const ageMs = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs : Number.POSITIVE_INFINITY;
    if (cacheTtlMs > 0 && Number.isFinite(cached) && ageMs >= 0 && ageMs < cacheTtlMs) {
      return cached;
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const onChainBalance = await this.readOnChainTokenBalance(wallet.address, normalized);
        wallet.balances[normalized] = onChainBalance;
        wallet.updatedAt = new Date().toISOString();
        syncLegacyBalance(wallet);
        saveDb();
        return onChainBalance;
      } catch (error) {
        const transient = isTransientRpcError(error);
        const isLast = attempt >= maxAttempts;
        if (!transient || isLast) {
          if (Number.isFinite(cached)) {
            console.warn(
              `[wdk] getBalance fallback to cached balance for ${wallet.address} ${normalized}: ${cached}`
            );
            return cached;
          }
          throw error;
        }
        await sleep(300 * attempt);
      }
    }

    if (Number.isFinite(cached)) {
      return cached;
    }
    throw new AppError("Unable to read wallet balance from RPC.", {
      code: ERROR_CODES.INTERNAL_ERROR,
      status: 500
    });
  }

  async signTransaction(payload: WalletTransferInput) {
    const fromWallet = await this.ensureEvmWallet(ensureWallet(payload.fromAddress));
    const normalizedAsset = normalizeAsset(payload.asset);
    const signedAt = new Date().toISOString();

    if (normalizedAsset === "BTC") {
      throw new AppError("BTC signing is not available in EVM WDK mode.", {
        code: ERROR_CODES.ASSET_NOT_SUPPORTED,
        status: 400
      });
    }

    const { manager, account } = await this.withWritableAccount(fromWallet);
    try {
      const signature = await account.sign(
        JSON.stringify({
          fromAddress: payload.fromAddress,
          toAddress: payload.toAddress,
          amount: payload.amount,
          asset: normalizedAsset,
          signedAt
        })
      );

      account.dispose();
      return {
        signature,
        signedAt
      };
    } finally {
      manager.dispose();
    }
  }

  async sendTransaction(input: WalletTransferInput): Promise<WalletTransferResult> {
    const fromWallet = await this.ensureEvmWallet(ensureWallet(input.fromAddress));
    const toWallet = await this.ensureEvmWallet(ensureWallet(input.toAddress));
    const asset = normalizeAsset(input.asset);

    assertPositiveAmount(input.amount);

    if (asset === "BTC") {
      throw new AppError("BTC transfers are not available in EVM WDK mode.", {
        code: ERROR_CODES.ASSET_NOT_SUPPORTED,
        status: 400
      });
    }

    if (!fromWallet.policy.allowedAssets.includes(asset)) {
      throw new AppError("Asset transfer blocked by wallet policy.", {
        code: ERROR_CODES.POLICY_VIOLATION,
        status: 403
      });
    }

    if (input.amount > fromWallet.policy.maxTransferPerTx) {
      throw new AppError("Transfer amount exceeds wallet policy limit.", {
        code: ERROR_CODES.POLICY_VIOLATION,
        status: 403
      });
    }

    const fromBalance = await this.getBalance(fromWallet.address, asset);
    if (fromBalance < input.amount) {
      throw new AppError("Insufficient balance for transfer.", {
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
        status: 400
      });
    }

    const tokenAddress = this.getTokenAddress(asset);
    const decimals = this.getDecimals(asset);

    const { manager, account } = await this.withWritableAccount(fromWallet);
    let onChainTxHash = "";
    try {
      const result = await account.transfer({
        token: tokenAddress,
        recipient: toWallet.address,
        amount: toAtomicUnits(input.amount, decimals)
      });
      onChainTxHash = result.hash;
      account.dispose();
    } finally {
      manager.dispose();
    }

    const fromAccount = findOrCreateAccount(fromWallet.address, asset);
    const toAccount = findOrCreateAccount(toWallet.address, asset);
    const signed = await this.signTransaction({
      ...input,
      fromAddress: fromWallet.address,
      toAddress: toWallet.address
    });

    // Refresh balances from chain after transfer. Keep tx success even if RPC is temporarily rate-limited.
    try {
      fromWallet.balances[asset] = await this.getBalance(fromWallet.address, asset);
    } catch (error) {
      console.warn(`[wdk] failed to refresh sender balance after transfer:`, error);
    }
    try {
      toWallet.balances[asset] = await this.getBalance(toWallet.address, asset);
    } catch (error) {
      console.warn(`[wdk] failed to refresh receiver balance after transfer:`, error);
    }
    fromWallet.updatedAt = new Date().toISOString();
    toWallet.updatedAt = new Date().toISOString();
    syncLegacyBalance(fromWallet);
    syncLegacyBalance(toWallet);

    const txId = "tx_" + uuidv4();
    const tx = {
      id: txId,
      fromAddress: fromWallet.address,
      toAddress: toWallet.address,
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      amount: input.amount,
      asset,
      signature: signed.signature,
      onChainTxHash,
      initiatedBy: input.initiatedBy ?? "agent",
      timestamp: new Date().toISOString()
    };

    db.walletTransactions.push(tx);
    saveDb();

    return {
      transactionId: tx.id,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      amount: tx.amount,
      asset: tx.asset,
      signature: tx.signature,
      onChainTxHash: tx.onChainTxHash,
      timestamp: tx.timestamp
    };
  }

  async listTransactions(params?: { walletAddress?: string; asset?: SettlementAsset; limit?: number }) {
    const asset = params?.asset ? normalizeAsset(params.asset) : null;
    const walletAddress = params?.walletAddress;
    const limit = params?.limit ?? 100;

    return db.walletTransactions
      .filter((item) => {
        const byWallet =
          !walletAddress || item.fromAddress === walletAddress || item.toAddress === walletAddress;
        const byAsset = !asset || item.asset === asset;
        return byWallet && byAsset;
      })
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, limit);
  }
}

function createWdkProvider(): WdkProvider {
  const mock = new MockWdkProvider();
  if (env.wdkProvider === "real") {
    return new RealWdkProvider(mock);
  }
  return mock;
}

export const wdkAdapter: WdkProvider = createWdkProvider();

export async function ensureTreasuryWallet() {
  const treasury = db.wallets.find((item) => item.ownerAgentId === null);
  if (!treasury) {
    await wdkAdapter.createWallet(null, 100000, env.settlementAsset, 0);
    return;
  }

  if (typeof treasury.creditTokenBalance !== "number") {
    treasury.creditTokenBalance = 0;
    treasury.updatedAt = new Date().toISOString();
    saveDb();
  }
}
