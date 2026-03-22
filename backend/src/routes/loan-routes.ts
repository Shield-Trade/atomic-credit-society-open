import { Router } from "express";
import { z } from "zod";
import { ERROR_CODES } from "../constants/error-codes";
import { requireAuth } from "../middleware/auth";
import { executeMatchedIntent } from "../services/loan-execution-service";
import { repayLoan } from "../services/loan-repayment-service";
import { evaluateBorrowAutonomyPolicy } from "../services/policy-engine";
import { db } from "../store/db";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/response";

const executeLoanSchema = z.object({
  intentId: z.string().uuid()
});

const repaySchema = z.object({
  loanId: z.string().uuid(),
  amount: z.number().positive().optional()
});

export const loanRoutes = Router();
loanRoutes.use(requireAuth);

loanRoutes.post(
  "/execute",
  asyncHandler(async (req, res) => {
    const payload = executeLoanSchema.parse(req.body);
    const intent = db.intents.find((item) => item.id === payload.intentId);
    if (!intent) {
      throw new AppError("Intent not found.", {
        code: ERROR_CODES.INTENT_NOT_FOUND,
        status: 404
      });
    }

    const borrower = db.agents.find((item) => item.id === intent.borrowerId);
    if (!borrower) {
      throw new AppError("Borrower agent not found.", {
        code: ERROR_CODES.AGENT_NOT_FOUND,
        status: 404
      });
    }

    const lender = intent.matchedLenderId
      ? db.agents.find((item) => item.id === intent.matchedLenderId) ?? null
      : null;

    const canExecuteAsBorrowerOwner = borrower.ownerUserId === req.auth!.userId;
    const canExecuteAsLenderOwner = lender ? lender.ownerUserId === req.auth!.userId : false;

    if (req.auth!.provider === "agent_token") {
      if (!req.auth!.claimedAgentId) {
        throw new AppError("Agent token cannot execute another agent's loan intent.", {
          code: ERROR_CODES.FORBIDDEN,
          status: 403
        });
      }

      if (req.auth!.claimedAgentId === borrower.id) {
        const offeredInterest =
          typeof intent.recommendedInterest === "number" ? intent.recommendedInterest : intent.maxInterest;
        const policy = evaluateBorrowAutonomyPolicy({
          userId: borrower.ownerUserId,
          amount: intent.amount,
          offeredInterest,
          riskProfile: intent.riskProfile
        });
        if (!policy.allowed) {
          throw new AppError(policy.reason, {
            code: ERROR_CODES.POLICY_VIOLATION,
            status: 422,
            details: {
              policy: policy.policy
            }
          });
        }
      } else if (!lender || req.auth!.claimedAgentId !== lender.id) {
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

    const executed = await executeMatchedIntent({
      intentId: payload.intentId,
      initiatedBy: "system",
      requireBorrowerOwnerUserId: canExecuteAsBorrowerOwner ? req.auth!.userId : null,
      requireLenderOwnerUserId: canExecuteAsLenderOwner ? req.auth!.userId : null
    });

    return sendSuccess(
      res,
      {
        loan: executed.loan,
        settlement: executed.settlement,
        reused: executed.reused
      },
      executed.reused ? 200 : 201
    );
  })
);

loanRoutes.post(
  "/repay",
  asyncHandler(async (req, res) => {
    const payload = repaySchema.parse(req.body);
    const repaid = await repayLoan({
      loanId: payload.loanId,
      amount: payload.amount,
      initiatedBy: "system",
      requireBorrowerOwnerUserId: req.auth!.userId,
      requireBorrowerAgentId: req.auth!.provider === "agent_token" ? req.auth!.claimedAgentId ?? null : null
    });

    return sendSuccess(res, {
      loan: repaid.loan,
      settlement: repaid.settlement,
      outstanding: repaid.outstanding
    });
  })
);

loanRoutes.get("/", (req, res) => {
  const userId = req.auth!.userId;
  const userAgents = db.agents.filter((item) => item.ownerUserId === userId).map((item) => item.id);

  const loans = db.loans.filter(
    (item) => userAgents.includes(item.borrowerId) || userAgents.includes(item.lenderId)
  );

  return sendSuccess(res, { loans });
});
