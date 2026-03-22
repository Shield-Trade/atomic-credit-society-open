import type { Agent } from "../types/domain";

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateIncomeStability(incomeValues: number[]): number {
  if (incomeValues.length === 0) {
    return 0;
  }

  const avg = incomeValues.reduce((sum, item) => sum + item, 0) / incomeValues.length;
  if (avg <= 0) {
    return 0;
  }

  const variance =
    incomeValues.reduce((sum, item) => sum + Math.pow(item - avg, 2), 0) / incomeValues.length;
  const stdDev = Math.sqrt(variance);
  const coefficient = stdDev / avg;

  return clamp(0, 1, 1 - coefficient);
}

function calculateRepaymentScore(agent: Agent): number {
  if (agent.repaymentHistory.length === 0) {
    return 0.5;
  }

  const onTimeCount = agent.repaymentHistory.filter((event) => event.onTime).length;
  return onTimeCount / agent.repaymentHistory.length;
}

export function calculateCreditScore(agent: Agent): number {
  const knowledgeNormalized = clamp(0, 1, agent.knowledgeScore / 100);
  const teachingNormalized = clamp(0, 1, agent.teachingScore / 100);
  const repaymentNormalized = calculateRepaymentScore(agent);
  const incomeStability = calculateIncomeStability(agent.incomeHistory.map((event) => event.amount));
  const defaultPenalty = clamp(0, 1, agent.defaultEvents / 10);

  const weighted =
    knowledgeNormalized * 0.2 +
    teachingNormalized * 0.15 +
    repaymentNormalized * 0.35 +
    incomeStability * 0.2 -
    defaultPenalty * 0.1;

  return Math.round(clamp(0, 1, weighted) * 100);
}

export function applyCreditUpdate(agent: Agent): Agent {
  agent.creditScore = calculateCreditScore(agent);
  agent.updatedAt = new Date().toISOString();
  return agent;
}
