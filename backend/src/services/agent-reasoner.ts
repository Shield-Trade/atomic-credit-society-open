import type { Agent, RiskProfile } from "../types/domain";

export interface BorrowDecision {
  shouldBorrow: boolean;
  reason: string;
  amount: number;
  durationDays: number;
  maxInterest: number;
  riskProfile: RiskProfile;
}

function resolveRiskProfile(creditScore: number): RiskProfile {
  if (creditScore >= 75) {
    return "low";
  }
  if (creditScore >= 55) {
    return "medium";
  }
  return "high";
}

export function decideBorrowIntent(params: {
  agent: Agent;
  walletBalance: number;
  outstandingLoanCount: number;
  thresholdBalance: number;
}): BorrowDecision {
  const { agent, walletBalance, outstandingLoanCount, thresholdBalance } = params;

  if (outstandingLoanCount > 0) {
    return {
      shouldBorrow: false,
      reason: "Borrower already has active debt; skipping new borrowing cycle.",
      amount: 0,
      durationDays: 0,
      maxInterest: 0,
      riskProfile: "high"
    };
  }

  if (walletBalance >= thresholdBalance) {
    return {
      shouldBorrow: false,
      reason: "Wallet balance is above operating threshold.",
      amount: 0,
      durationDays: 0,
      maxInterest: 0,
      riskProfile: resolveRiskProfile(agent.creditScore)
    };
  }

  const gap = Math.max(40, thresholdBalance - walletBalance);
  const amount = Number(Math.min(300, gap + 40).toFixed(2));
  const riskProfile = resolveRiskProfile(agent.creditScore);
  const durationDays = riskProfile === "low" ? 7 : riskProfile === "medium" ? 10 : 14;
  const maxInterest = riskProfile === "low" ? 7 : riskProfile === "medium" ? 9 : 12;

  return {
    shouldBorrow: true,
    reason: "Agent reasoner triggered autonomous borrowing due to low operational balance.",
    amount,
    durationDays,
    maxInterest,
    riskProfile
  };
}
