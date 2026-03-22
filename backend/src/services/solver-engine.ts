import { db, saveDb } from "../store/db";
import { evaluateIntent } from "./matching-engine";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";

export async function solveIntent(params: { intentId: string; solverAgentId: string | null }) {
  const intent = db.intents.find((item) => item.id === params.intentId);

  if (!intent) {
    throw new AppError("Intent not found.", {
      code: ERROR_CODES.INTENT_NOT_FOUND,
      status: 404
    });
  }

  if (intent.status === "matched") {
    return {
      intent,
      decision: {
        approved: true,
        reason: "Intent already matched.",
        lenderId: intent.matchedLenderId,
        offeredInterest: intent.recommendedInterest
      }
    };
  }

  if (intent.status !== "open" && intent.status !== "solving") {
    throw new AppError("Intent is not available for solver processing.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  intent.status = "solving";
  intent.solverAgentId = params.solverAgentId;
  intent.solverEvaluatedAt = new Date().toISOString();

  const decision = await evaluateIntent(intent);

  if (
    !decision.approved ||
    !decision.lenderId ||
    typeof decision.offeredInterest !== "number" ||
    ((intent.source ?? "borrow_request") === "lend_request" && !decision.borrowerId)
  ) {
    intent.status = "rejected";
    intent.matchedLenderId = null;
    intent.solverReason = decision.reason;
    intent.solverEvaluatedAt = new Date().toISOString();
    saveDb();
    return {
      intent,
      decision: {
        approved: false,
        reason: decision.reason,
        lenderId: null,
        offeredInterest: null
      }
    };
  }

  if ((intent.source ?? "borrow_request") === "lend_request" && decision.borrowerId) {
    intent.borrowerId = decision.borrowerId;
    intent.requestedLenderId = decision.lenderId;
  }

  intent.matchedLenderId = decision.lenderId;
  intent.status = "matched";
  intent.recommendedInterest = decision.offeredInterest;
  intent.solverReason = decision.reason;
  intent.solverEvaluatedAt = new Date().toISOString();
  saveDb();

  return {
    intent,
    decision: {
      approved: true,
      reason: decision.reason,
      lenderId: decision.lenderId,
      offeredInterest: decision.offeredInterest
    }
  };
}
