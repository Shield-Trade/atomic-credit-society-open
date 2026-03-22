import { ERROR_CODES } from "../constants/error-codes";
import { evaluateBorrowAutonomyPolicy } from "./policy-engine";
import { executeMatchedIntent } from "./loan-execution-service";
import { db } from "../store/db";
import { AppError } from "../utils/app-error";

export async function autoSettleMatchedIntent(params: {
  intentId: string;
  userId: string;
  provider: "jwt" | "api_key" | "agent_token";
  claimedAgentId?: string | null;
}) {
  const intent = db.intents.find((item) => item.id === params.intentId);
  if (!intent) {
    throw new AppError("Intent not found.", {
      code: ERROR_CODES.INTENT_NOT_FOUND,
      status: 404
    });
  }

  if (!intent.matchedLenderId) {
    return {
      autoSettled: false as const,
      skippedReason: "Intent is not matched yet.",
      policy: null,
      execution: null
    };
  }

  const borrower = db.agents.find((item) => item.id === intent.borrowerId);
  const lender = db.agents.find((item) => item.id === intent.matchedLenderId);
  if (!borrower || !lender) {
    throw new AppError("Borrower or lender agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  const canExecuteAsBorrowerOwner = borrower.ownerUserId === params.userId;
  const canExecuteAsLenderOwner = lender.ownerUserId === params.userId;

  if (params.provider === "agent_token") {
    if (!params.claimedAgentId || (params.claimedAgentId !== borrower.id && params.claimedAgentId !== lender.id)) {
      throw new AppError("Agent token cannot execute another agent's loan intent.", {
        code: ERROR_CODES.FORBIDDEN,
        status: 403
      });
    }
  } else if (!canExecuteAsBorrowerOwner && !canExecuteAsLenderOwner) {
    throw new AppError("Cannot execute another user's loan intent.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  const offeredInterest =
    typeof intent.recommendedInterest === "number" ? intent.recommendedInterest : intent.maxInterest;
  const policyResult = evaluateBorrowAutonomyPolicy({
    userId: borrower.ownerUserId,
    amount: intent.amount,
    offeredInterest,
    riskProfile: intent.riskProfile
  });

  if (!policyResult.allowed) {
    return {
      autoSettled: false as const,
      skippedReason: policyResult.reason,
      policy: {
        allowed: false,
        reason: policyResult.reason,
        detail: policyResult.policy
      },
      execution: null
    };
  }

  const execution = await executeMatchedIntent({
    intentId: intent.id,
    initiatedBy: "system",
    requireBorrowerOwnerUserId: canExecuteAsBorrowerOwner ? params.userId : null,
    requireLenderOwnerUserId: canExecuteAsLenderOwner ? params.userId : null
  });

  return {
    autoSettled: true as const,
    skippedReason: null,
    policy: {
      allowed: true,
      reason: policyResult.reason,
      detail: policyResult.policy
    },
    execution
  };
}
