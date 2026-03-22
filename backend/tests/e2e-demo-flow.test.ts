import test from "node:test";
import assert from "node:assert/strict";
import { v4 as uuidv4 } from "uuid";
import { db } from "../src/store/db";
import { evaluateIntent } from "../src/services/matching-engine";
import { wdkAdapter } from "../src/services/wdk-adapter";
import { applyCreditUpdate } from "../src/services/credit-engine";
import type { Agent, BorrowIntent } from "../src/types/domain";

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

test("e2e demo flow: learn -> intent -> match -> execute -> repay -> credit update", async () => {
  resetDb();
  await wdkAdapter.createWallet(null, 100000);

  const treasury = db.wallets.find((wallet) => wallet.ownerAgentId === null);
  assert.ok(treasury, "treasury wallet should exist");

  const borrowerId = uuidv4();
  const lenderId = uuidv4();
  const borrowerWallet = await wdkAdapter.createWallet(borrowerId, 0);
  const lenderWallet = await wdkAdapter.createWallet(lenderId, 0);

  const borrower: Agent = {
    id: borrowerId,
    ownerUserId: "u1",
    name: "Agent A",
    walletAddress: borrowerWallet.address,
    reputationScore: 55,
    knowledgeScore: 40,
    teachingScore: 20,
    creditScore: 0,
    incomeHistory: [{ amount: 30, source: "teaching" as const, timestamp: new Date().toISOString() }],
    repaymentHistory: [],
    defaultEvents: 0,
    isDisabled: false,
    disabledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const lender: Agent = {
    id: lenderId,
    ownerUserId: "u2",
    name: "Agent B",
    walletAddress: lenderWallet.address,
    reputationScore: 70,
    knowledgeScore: 60,
    teachingScore: 35,
    creditScore: 85,
    incomeHistory: [],
    repaymentHistory: [],
    defaultEvents: 0,
    isDisabled: false,
    disabledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.agents.push(borrower, lender);

  applyCreditUpdate(borrower);
  const initialCredit = borrower.creditScore;

  await wdkAdapter.sendTransaction({
    fromAddress: treasury!.address,
    toAddress: lender.walletAddress,
    amount: 500
  });

  const intent: BorrowIntent = {
    id: uuidv4(),
    borrowerId: borrower.id,
    amount: 100,
    asset: "USDT",
    durationDays: 7,
    maxInterest: 8,
    riskProfile: "low" as const,
    recommendedInterest: 6.3,
    timestamp: new Date().toISOString(),
    matchedLenderId: null,
    solverAgentId: null,
    solverReason: null,
    solverEvaluatedAt: null,
    humanApprovedAt: null,
    status: "open" as const
  };

  const decision = await evaluateIntent(intent);
  assert.equal(decision.approved, true);
  assert.ok(decision.lenderId, "expected a lender match");

  await wdkAdapter.sendTransaction({
    fromAddress: lender.walletAddress,
    toAddress: borrower.walletAddress,
    amount: intent.amount
  });

  const amountDue = Number((intent.amount * (1 + (decision.offeredInterest ?? 8) / 100)).toFixed(2));

  borrower.incomeHistory.push({
    amount: 150,
    source: "system_reward",
    timestamp: new Date().toISOString()
  });

  await wdkAdapter.sendTransaction({
    fromAddress: treasury!.address,
    toAddress: borrower.walletAddress,
    amount: 150
  });

  await wdkAdapter.sendTransaction({
    fromAddress: borrower.walletAddress,
    toAddress: lender.walletAddress,
    amount: amountDue
  });

  borrower.repaymentHistory.push({
    loanId: uuidv4(),
    amount: amountDue,
    onTime: true,
    timestamp: new Date().toISOString()
  });

  applyCreditUpdate(borrower);
  assert.ok(borrower.creditScore >= initialCredit, "credit score should improve after successful repayment");
});
