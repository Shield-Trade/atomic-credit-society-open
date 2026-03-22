import test from "node:test";
import assert from "node:assert/strict";
import type { Agent } from "../src/types/domain";
import { calculateCreditScore } from "../src/services/credit-engine";

function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "a1",
    ownerUserId: "u1",
    name: "Borrower",
    walletAddress: "wdk_test",
    reputationScore: 50,
    knowledgeScore: 30,
    teachingScore: 10,
    creditScore: 0,
    incomeHistory: [],
    repaymentHistory: [],
    defaultEvents: 0,
    isDisabled: false,
    disabledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

test("credit score increases with stronger activity signals", () => {
  const lowSignalAgent = buildAgent({
    knowledgeScore: 10,
    teachingScore: 0,
    incomeHistory: [{ amount: 5, source: "other", timestamp: new Date().toISOString() }],
    repaymentHistory: [{ loanId: "l1", amount: 10, onTime: false, timestamp: new Date().toISOString() }],
    defaultEvents: 1
  });

  const highSignalAgent = buildAgent({
    knowledgeScore: 80,
    teachingScore: 70,
    incomeHistory: [
      { amount: 100, source: "teaching", timestamp: new Date().toISOString() },
      { amount: 110, source: "system_reward", timestamp: new Date().toISOString() },
      { amount: 95, source: "other", timestamp: new Date().toISOString() }
    ],
    repaymentHistory: [
      { loanId: "l2", amount: 30, onTime: true, timestamp: new Date().toISOString() },
      { loanId: "l3", amount: 40, onTime: true, timestamp: new Date().toISOString() }
    ],
    defaultEvents: 0
  });

  const low = calculateCreditScore(lowSignalAgent);
  const high = calculateCreditScore(highSignalAgent);

  assert.ok(high > low, "expected high-signal agent to have better credit score");
  assert.ok(low >= 0 && high <= 100, "score should remain in 0-100 range");
});
