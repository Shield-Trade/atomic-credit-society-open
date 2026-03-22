import type { Agent, RiskProfile } from "../types/domain";

export interface PricingDecision {
  approved: boolean;
  reason?: string;
  interestRate?: number;
  riskLevel?: RiskProfile;
}

function mapRiskLevel(rate: number): RiskProfile {
  if (rate < 6) {
    return "low";
  }
  if (rate <= 10) {
    return "medium";
  }
  return "high";
}

export function calculateDeterministicPricing(agent: Agent): PricingDecision {
  const baseRate = 5;

  let riskPremium = 0;
  if (agent.creditScore >= 80) {
    riskPremium = 1;
  } else if (agent.creditScore >= 70) {
    riskPremium = 2;
  } else if (agent.creditScore >= 60) {
    riskPremium = 4;
  } else if (agent.creditScore >= 50) {
    riskPremium = 6;
  } else {
    return {
      approved: false,
      reason: "Credit too low"
    };
  }

  const learningDiscount = Math.min(agent.knowledgeScore / 100, 2);
  const teachingDiscount = Math.min(agent.teachingScore / 200, 1.5);

  let defaultPenalty = 0;
  if (agent.defaultEvents === 1) {
    defaultPenalty = 3;
  }
  if (agent.defaultEvents >= 2) {
    defaultPenalty = 6;
  }

  const rawRate = baseRate + riskPremium - learningDiscount - teachingDiscount + defaultPenalty;
  const interestRate = Number(rawRate.toFixed(2));

  return {
    approved: true,
    interestRate,
    riskLevel: mapRiskLevel(interestRate)
  };
}
