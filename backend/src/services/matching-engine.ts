import { db } from "../store/db";
import { calculateDeterministicPricing } from "./pricing-engine";
import { wdkAdapter } from "./wdk-adapter";
import type { BorrowIntent, MatchDecision } from "../types/domain";

function lenderSortScore(agent: { creditScore: number; knowledgeScore: number; teachingScore: number }) {
  return agent.creditScore * 1.2 + agent.knowledgeScore * 0.4 + agent.teachingScore * 0.4;
}

function borrowerSortScore(agent: { creditScore: number; knowledgeScore: number; teachingScore: number }) {
  return agent.creditScore * 1.3 + agent.knowledgeScore * 0.3 + agent.teachingScore * 0.2;
}

function riskCompatible(creditScore: number, riskProfile: BorrowIntent["riskProfile"]) {
  if (riskProfile === "low") {
    return creditScore >= 70;
  }
  if (riskProfile === "medium") {
    return creditScore >= 50;
  }
  return true;
}

async function evaluateLendIntent(intent: BorrowIntent): Promise<MatchDecision> {
  const lenderId = intent.requestedLenderId ?? intent.matchedLenderId ?? intent.borrowerId;
  const lender = db.agents.find((agent) => agent.id === lenderId);
  if (!lender) {
    return {
      approved: false,
      reason: "Requested lender not found."
    };
  }

  if (lender.isDisabled) {
    return {
      approved: false,
      reason: "Requested lender is disabled."
    };
  }

  const lenderBalance = await wdkAdapter.getBalance(lender.walletAddress, intent.asset);
  if (lenderBalance < intent.amount) {
    return {
      approved: false,
      reason: `Requested lender balance is insufficient (${lenderBalance} < ${intent.amount}).`
    };
  }

  const borrowerCandidates = db.agents.filter((agent) => agent.id !== lender.id && !agent.isDisabled);
  const accepted: Array<{
    borrowerId: string;
    borrowerName: string;
    interestRate: number;
    score: number;
  }> = [];

  for (const candidate of borrowerCandidates) {
    if (!riskCompatible(candidate.creditScore, intent.riskProfile)) {
      continue;
    }

    const pricing = calculateDeterministicPricing(candidate);
    if (!pricing.approved || typeof pricing.interestRate !== "number") {
      continue;
    }

    if (pricing.interestRate > intent.maxInterest) {
      continue;
    }

    accepted.push({
      borrowerId: candidate.id,
      borrowerName: candidate.name,
      interestRate: pricing.interestRate,
      score: borrowerSortScore(candidate)
    });
  }

  accepted.sort((a, b) => b.score - a.score);
  const selected = accepted[0];
  if (!selected) {
    return {
      approved: false,
      reason: "No borrower candidates fit lender risk and rate constraints."
    };
  }

  return {
    approved: true,
    reason: `Matched borrower ${selected.borrowerName} with deterministic rate ${selected.interestRate}%.`,
    lenderId: lender.id,
    borrowerId: selected.borrowerId,
    offeredInterest: selected.interestRate
  };
}

export async function evaluateIntent(intent: BorrowIntent): Promise<MatchDecision> {
  if ((intent.source ?? "borrow_request") === "lend_request") {
    return evaluateLendIntent(intent);
  }

  const borrower = db.agents.find((agent) => agent.id === intent.borrowerId);
  if (!borrower) {
    return {
      approved: false,
      reason: "Borrower not found."
    };
  }

  if (borrower.isDisabled) {
    return {
      approved: false,
      reason: "Borrower is disabled."
    };
  }

  const pricing = calculateDeterministicPricing(borrower);
  if (!pricing.approved || typeof pricing.interestRate !== "number") {
    return {
      approved: false,
      reason: pricing.reason ?? "Pricing engine rejected borrower profile."
    };
  }

  if (pricing.interestRate > intent.maxInterest) {
    return {
      approved: false,
      reason: `Required interest ${pricing.interestRate}% exceeds user max ${intent.maxInterest}%.`
    };
  }

  const lenderCandidates = db.agents.filter((agent) => agent.id !== borrower.id && !agent.isDisabled);
  const lenders: typeof lenderCandidates = [];

  for (const candidate of lenderCandidates) {
    const wallet = db.wallets.find((walletItem) => walletItem.address === candidate.walletAddress);
    if (!wallet) {
      continue;
    }
    const balance = await wdkAdapter.getBalance(candidate.walletAddress, intent.asset);
    if (balance >= intent.amount) {
      lenders.push(candidate);
    }
  }

  lenders.sort((a, b) => lenderSortScore(b) - lenderSortScore(a));

  if (lenders.length === 0) {
    return {
      approved: false,
      reason: "No lender agents available with sufficient balance."
    };
  }

  const selectedLender = lenders[0];

  return {
    approved: true,
    reason: `Matched to ${selectedLender.name} using deterministic pricing ${pricing.interestRate}%.`,
    lenderId: selectedLender.id,
    offeredInterest: pricing.interestRate
  };
}
