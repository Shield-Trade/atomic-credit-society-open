import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/store/db";
import { wdkAdapter } from "../src/services/wdk-adapter";
import { AppError } from "../src/utils/app-error";
import { ERROR_CODES } from "../src/constants/error-codes";

function resetDb() {
  db.users = [];
  db.apiKeys = [];
  db.agents = [];
  db.agentClaims = [];
  db.intents = [];
  db.loans = [];
  db.wallets = [];
  db.walletTransactions = [];
  db.creditTokenTransactions = [];
  db.knowledgePoints = [];
  db.knowledgeLearnings = [];
  db.autonomyPolicies = [];
  db.autonomyTickReports = [];
  db.runtimeMode = {
    autoEnabled: false,
    updatedAt: new Date().toISOString()
  };
}

test("wdk adapter supports account creation, signing, transfer, and history", async () => {
  resetDb();

  const treasury = await wdkAdapter.createWallet(null, 1000, "USDT");
  const walletA = await wdkAdapter.createWallet("agent-a", 100, "USDT");
  const walletB = await wdkAdapter.createWallet("agent-b", 0, "USDT");

  const xautAccount = await wdkAdapter.createAccount(walletA.address, "XAUT");
  assert.equal(xautAccount.asset, "XAUT");

  await wdkAdapter.updatePolicy(walletA.address, {
    maxTransferPerTx: 60,
    allowedAssets: ["USDT", "XAUT"]
  });

  await assert.rejects(
    async () =>
      await wdkAdapter.sendTransaction({
        fromAddress: walletA.address,
        toAddress: walletB.address,
        amount: 70,
        asset: "USDT"
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, ERROR_CODES.POLICY_VIOLATION);
      return true;
    }
  );

  const tx = await wdkAdapter.sendTransaction({
    fromAddress: treasury.address,
    toAddress: walletB.address,
    amount: 80,
    asset: "USDT",
    initiatedBy: "system"
  });

  assert.equal(tx.asset, "USDT");
  assert.ok(tx.signature.startsWith("sig_"));
  assert.ok(tx.onChainTxHash.startsWith("chain_"));

  const history = await wdkAdapter.listTransactions({
    walletAddress: walletB.address
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].toAddress, walletB.address);
});
