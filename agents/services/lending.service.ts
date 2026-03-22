import { runAgent } from "./agent.service";
import { calculateInterest } from "./pricing.service";

export async function processBorrowRequest(input: any) {
  // 1️⃣ Agent decision
  const agentDecision = await runAgent("borrow", input);

  if (agentDecision.decision === "reject") {
    return {
      status: "rejected",
      reason: agentDecision.reason
    };
  }

  // 2️⃣ Pricing Engine（真正金融邏輯）
  const pricing = calculateInterest({
    credit_score: input.credit_score,
    learning_points: input.learning_points,
    teaching_points: input.teaching_points,
    default_count: input.default_count || 0
  });

  if (!pricing.approved) {
    return {
      status: "rejected",
      reason: pricing.reason
    };
  }

  // 3️⃣ 合併結果
  return {
    status: "pending_user_approval",
    recommendation: {
      ...agentDecision.recommendation,
      interest_rate: pricing.interest_rate,
      risk_level: pricing.risk_level
    }
  };
}