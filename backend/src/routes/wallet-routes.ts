import { Router } from "express";
import { z } from "zod";
import { ERROR_CODES } from "../constants/error-codes";
import { requireAuth } from "../middleware/auth";
import { SUPPORTED_ASSETS, wdkAdapter } from "../services/wdk-adapter";
import { db, saveDb } from "../store/db";
import type { SettlementAsset } from "../types/domain";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/response";

const assetEnum = z.enum(["USDT", "USAT", "XAUT", "BTC"]);

const createWalletSchema = z.object({
  agentId: z.string().uuid()
});

const sendSchema = z.object({
  fromAddress: z.string().min(10),
  toAddress: z.string().min(10),
  amount: z.number().positive(),
  asset: assetEnum.optional()
});

const balanceQuerySchema = z.object({
  walletAddress: z.string().min(10),
  asset: assetEnum.optional()
});

const accountsQuerySchema = z.object({
  walletAddress: z.string().min(10)
});

const creditBalanceQuerySchema = z.object({
  walletAddress: z.string().min(10)
});

const historyQuerySchema = z.object({
  walletAddress: z.string().min(10),
  asset: assetEnum.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

const updatePolicySchema = z.object({
  walletAddress: z.string().min(10),
  maxTransferPerTx: z.number().positive(),
  allowedAssets: z.array(assetEnum).min(1)
});

function getOwnedWalletOrThrow(walletAddress: string, userId: string) {
  const wallet = db.wallets.find((item) => item.address === walletAddress);

  if (!wallet) {
    throw new AppError("Wallet not found.", {
      code: ERROR_CODES.WALLET_NOT_FOUND,
      status: 404
    });
  }

  if (!wallet.ownerAgentId) {
    throw new AppError("Cannot access system treasury wallet.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  const ownerAgent = db.agents.find((item) => item.id === wallet.ownerAgentId);
  if (!ownerAgent || ownerAgent.ownerUserId !== userId) {
    throw new AppError("Cannot access another user's wallet.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  return wallet;
}

function ensureAgentActive(agentId: string) {
  const agent = db.agents.find((item) => item.id === agentId);
  if (!agent) {
    throw new AppError("Agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }
  if (agent.isDisabled) {
    throw new AppError("Disabled agent cannot operate wallet actions.", {
      code: ERROR_CODES.AGENT_DISABLED,
      status: 403
    });
  }
  return agent;
}

export const walletRoutes = Router();
walletRoutes.use(requireAuth);

walletRoutes.get("/assets", (_req, res) => {
  return sendSuccess(res, {
    assets: [...SUPPORTED_ASSETS]
  });
});

walletRoutes.post(
  "/create",
  asyncHandler(async (req, res) => {
    const payload = createWalletSchema.parse(req.body);
    const agent = db.agents.find((item) => item.id === payload.agentId);

    if (!agent) {
      throw new AppError("Agent not found.", {
        code: ERROR_CODES.AGENT_NOT_FOUND,
        status: 404
      });
    }

    if (agent.ownerUserId !== req.auth!.userId) {
      throw new AppError("Cannot create wallet for another user's agent.", {
        code: ERROR_CODES.FORBIDDEN,
        status: 403
      });
    }

    ensureAgentActive(agent.id);

    const wallet = await wdkAdapter.createWallet(agent.id);
    agent.walletAddress = wallet.address;
    saveDb();

    return sendSuccess(
      res,
      {
        wallet
      },
      201
    );
  })
);

walletRoutes.get(
  "/balance",
  asyncHandler(async (req, res) => {
    const payload = balanceQuerySchema.parse(req.query);
    const wallet = getOwnedWalletOrThrow(payload.walletAddress, req.auth!.userId);
    const asset = (payload.asset ?? "USDT") as SettlementAsset;

    return sendSuccess(res, {
      walletAddress: wallet.address,
      asset,
      balance: await wdkAdapter.getBalance(wallet.address, asset)
    });
  })
);

walletRoutes.get(
  "/credit-balance",
  asyncHandler(async (req, res) => {
    const payload = creditBalanceQuerySchema.parse(req.query);
    const wallet = getOwnedWalletOrThrow(payload.walletAddress, req.auth!.userId);

    return sendSuccess(res, {
      walletAddress: wallet.address,
      creditTokenBalance: await wdkAdapter.getCreditTokenBalance(wallet.address)
    });
  })
);

walletRoutes.get(
  "/accounts",
  asyncHandler(async (req, res) => {
    const payload = accountsQuerySchema.parse(req.query);
    const wallet = getOwnedWalletOrThrow(payload.walletAddress, req.auth!.userId);
    const accounts = await wdkAdapter.getAccounts(wallet.address);
    return sendSuccess(res, {
      walletAddress: wallet.address,
      accounts
    });
  })
);

walletRoutes.get(
  "/history",
  asyncHandler(async (req, res) => {
    const payload = historyQuerySchema.parse(req.query);
    const wallet = getOwnedWalletOrThrow(payload.walletAddress, req.auth!.userId);
    const transactions = await wdkAdapter.listTransactions({
      walletAddress: wallet.address,
      asset: payload.asset,
      limit: payload.limit
    });

    return sendSuccess(res, {
      walletAddress: wallet.address,
      transactions
    });
  })
);

walletRoutes.post(
  "/policy",
  asyncHandler(async (req, res) => {
    const payload = updatePolicySchema.parse(req.body);
    const wallet = getOwnedWalletOrThrow(payload.walletAddress, req.auth!.userId);
    if (wallet.ownerAgentId) {
      ensureAgentActive(wallet.ownerAgentId);
    }
    const policy = await wdkAdapter.updatePolicy(wallet.address, {
      maxTransferPerTx: payload.maxTransferPerTx,
      allowedAssets: payload.allowedAssets
    });

    return sendSuccess(res, {
      walletAddress: wallet.address,
      policy
    });
  })
);

walletRoutes.post(
  "/send",
  asyncHandler(async (req, res) => {
    const payload = sendSchema.parse(req.body);
    const wallet = getOwnedWalletOrThrow(payload.fromAddress, req.auth!.userId);
    if (wallet.ownerAgentId) {
      ensureAgentActive(wallet.ownerAgentId);
    }

    const settlement = await wdkAdapter.sendTransaction({
      fromAddress: payload.fromAddress,
      toAddress: payload.toAddress,
      amount: payload.amount,
      asset: payload.asset,
      initiatedBy: "agent"
    });

    return sendSuccess(res, {
      settlement
    });
  })
);
