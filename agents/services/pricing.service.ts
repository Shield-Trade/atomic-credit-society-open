type AgentProfile = {
  credit_score: number;
  learning_points: number;
  teaching_points: number;
  default_count: number;
};

export function calculateInterest(agent: AgentProfile) {
  const baseRate = 5;

  let riskPremium = 0;

  if (agent.credit_score >= 80) riskPremium = 1;
  else if (agent.credit_score >= 70) riskPremium = 2;
  else if (agent.credit_score >= 60) riskPremium = 4;
  else if (agent.credit_score >= 50) riskPremium = 6;
  else {
    return {
      approved: false,
      reason: "Credit too low"
    };
  }

  const learningDiscount = Math.min(agent.learning_points / 100, 2);
  const teachingDiscount = Math.min(agent.teaching_points / 200, 1.5);

  let defaultPenalty = 0;
  if (agent.default_count === 1) defaultPenalty = 3;
  if (agent.default_count >= 2) defaultPenalty = 6;

  const interest =
    baseRate +
    riskPremium -
    learningDiscount -
    teachingDiscount +
    defaultPenalty;

  return {
    approved: true,
    interest_rate: parseFloat(interest.toFixed(2)),
    risk_level: mapRiskLevel(interest)
  };
}

function mapRiskLevel(rate: number): "low" | "medium" | "high" {
  if (rate < 6) return "low";
  if (rate <= 10) return "medium";
  return "high";
}