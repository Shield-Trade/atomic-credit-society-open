import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/store/db";
import { evaluateIntent } from "../src/services/matching-engine";
import { wdkAdapter } from "../src/services/wdk-adapter";

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

test("matching engine approves when borrower credit and lender availability are valid", async () => {
  resetDb();

  await wdkAdapter.createWallet(null, 100000, "USDT");
  const borrowerWallet = await wdkAdapter.createWallet("borrower-1", 20, "USDT");
  const lenderWallet = await wdkAdapter.createWallet("lender-1", 500, "USDT");

  db.agents.push(
    {
      id: "borrower-1",
      ownerUserId: "u1",
      name: "Borrower",
      walletAddress: borrowerWallet.address,
      reputationScore: 60,
      knowledgeScore: 55,
      teachingScore: 30,
      creditScore: 78,
      incomeHistory: [],
      repaymentHistory: [],
      defaultEvents: 0,
      isDisabled: false,
      disabledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "lender-1",
      ownerUserId: "u2",
      name: "Lender",
      walletAddress: lenderWallet.address,
      reputationScore: 70,
      knowledgeScore: 65,
      teachingScore: 35,
      creditScore: 88,
      incomeHistory: [],
      repaymentHistory: [],
      defaultEvents: 0,
      isDisabled: false,
      disabledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  );

  const decision = await evaluateIntent({
    id: "intent-1",
    borrowerId: "borrower-1",
    amount: 100,
    asset: "USDT",
    durationDays: 7,
    maxInterest: 8,
    riskProfile: "medium",
    recommendedInterest: 6.1,
    timestamp: new Date().toISOString(),
    matchedLenderId: null,
    solverAgentId: null,
    solverReason: null,
    solverEvaluatedAt: null,
    humanApprovedAt: null,
    status: "open"
  });

  assert.equal(decision.approved, true);
  assert.equal(decision.lenderId, "lender-1");
  assert.ok(typeof decision.offeredInterest === "number");
});
