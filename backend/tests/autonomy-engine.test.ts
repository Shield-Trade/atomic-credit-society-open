import test from "node:test";
import assert from "node:assert/strict";
import { v4 as uuidv4 } from "uuid";
import { db } from "../src/store/db";
import { runAutonomyTick } from "../src/services/autonomy-engine";
import type { Agent } from "../src/types/domain";

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

function buildAgent(params: {
  id: string;
  ownerUserId: string;
  name: string;
  walletAddress: string;
  creditScore: number;
}): Agent {
  return {
    id: params.id,
    ownerUserId: params.ownerUserId,
    name: params.name,
    walletAddress: params.walletAddress,
    reputationScore: 60,
    knowledgeScore: 60,
    teachingScore: 40,
    creditScore: params.creditScore,
    incomeHistory: [],
    repaymentHistory: [],
    defaultEvents: 0,
    isDisabled: false,
    disabledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

test("autonomy engine marks overdue loan as default and emits reminder actions", async () => {
  resetDb();

  const borrowerId = uuidv4();
  const lenderId = uuidv4();

  db.wallets.push(
    {
      address: "wdk_borrower",
      ownerAgentId: borrowerId,
      balance: 0,
      creditTokenBalance: 50,
      balances: { USDT: 0, USAT: 0, XAUT: 0, BTC: 0 },
      accounts: [],
      policy: { maxTransferPerTx: 5000, allowedAssets: ["USDT", "USAT", "XAUT", "BTC"] },
      provider: "mock",
      wdk: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      address: "wdk_lender",
      ownerAgentId: lenderId,
      balance: 0,
      creditTokenBalance: 50,
      balances: { USDT: 0, USAT: 0, XAUT: 0, BTC: 0 },
      accounts: [],
      policy: { maxTransferPerTx: 5000, allowedAssets: ["USDT", "USAT", "XAUT", "BTC"] },
      provider: "mock",
      wdk: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  );

  db.agents.push(
    buildAgent({
      id: borrowerId,
      ownerUserId: "owner-1",
      name: "Borrower",
      walletAddress: "wdk_borrower",
      creditScore: 80
    }),
    buildAgent({
      id: lenderId,
      ownerUserId: "owner-2",
      name: "Lender",
      walletAddress: "wdk_lender",
      creditScore: 88
    })
  );

  const dueSoon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const overdue = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  db.loans.push(
    {
      id: "loan-due-soon",
      borrowerId,
      lenderId,
      intentId: "intent-1",
      amount: 100,
      interestRate: 6,
      durationDays: 7,
      status: "active",
      asset: "USDT",
      createdAt: new Date().toISOString(),
      dueAt: dueSoon,
      repaidAt: null,
      totalRepaid: 0
    },
    {
      id: "loan-overdue",
      borrowerId,
      lenderId,
      intentId: "intent-2",
      amount: 100,
      interestRate: 6,
      durationDays: 7,
      status: "active",
      asset: "USDT",
      createdAt: new Date().toISOString(),
      dueAt: overdue,
      repaidAt: null,
      totalRepaid: 0
    }
  );

  const report = await runAutonomyTick();
  assert.ok(report.actions.some((item) => item.type === "loan_repayment_due"));
  assert.ok(report.actions.some((item) => item.type === "loan_defaulted"));

  const defaulted = db.loans.find((item) => item.id === "loan-overdue");
  assert.equal(defaulted?.status, "defaulted");
});

test("autonomy engine solves open intents and flags matched intents for human approval", async () => {
  resetDb();

  const borrowerId = uuidv4();
  const lenderId = uuidv4();

  db.wallets.push(
    {
      address: "wdk_borrower_2",
      ownerAgentId: borrowerId,
      balance: 0,
      creditTokenBalance: 50,
      balances: { USDT: 0, USAT: 0, XAUT: 0, BTC: 0 },
      accounts: [],
      policy: { maxTransferPerTx: 5000, allowedAssets: ["USDT", "USAT", "XAUT", "BTC"] },
      provider: "mock",
      wdk: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      address: "wdk_lender_2",
      ownerAgentId: lenderId,
      balance: 200,
      creditTokenBalance: 50,
      balances: { USDT: 200, USAT: 0, XAUT: 0, BTC: 0 },
      accounts: [],
      policy: { maxTransferPerTx: 5000, allowedAssets: ["USDT", "USAT", "XAUT", "BTC"] },
      provider: "mock",
      wdk: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  );

  db.agents.push(
    buildAgent({
      id: borrowerId,
      ownerUserId: "owner-1",
      name: "Borrower 2",
      walletAddress: "wdk_borrower_2",
      creditScore: 82
    }),
    buildAgent({
      id: lenderId,
      ownerUserId: "owner-2",
      name: "Lender 2",
      walletAddress: "wdk_lender_2",
      creditScore: 88
    })
  );

  db.intents.push({
    id: "intent-open-1",
    borrowerId,
    amount: 20,
    asset: "USDT",
    durationDays: 7,
    maxInterest: 12,
    riskProfile: "low",
    recommendedInterest: null,
    timestamp: new Date().toISOString(),
    matchedLenderId: null,
    solverAgentId: null,
    solverReason: null,
    solverEvaluatedAt: null,
    humanApprovedAt: null,
    status: "open"
  });

  db.autonomyPolicies.push({
    userId: "owner-1",
    autoBorrowEnabled: true,
    autoRepayEnabled: true,
    borrowMaxAmount: 100,
    borrowMaxInterest: 12,
    allowedRiskProfiles: ["low", "medium", "high"],
    updatedAt: new Date().toISOString()
  });

  const report = await runAutonomyTick({
    ownerUserId: "owner-1"
  });

  assert.ok(report.actions.some((item) => item.type === "borrow_intent_matched"));
  assert.ok(report.actions.some((item) => item.type === "loan_executed"));
  assert.equal(db.intents[0]?.status, "matched");
  assert.equal(db.loans.length, 1);
});
