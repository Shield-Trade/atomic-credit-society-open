import { Router } from "express";
import { z } from "zod";
import { ERROR_CODES } from "../constants/error-codes";
import { requireAuth } from "../middleware/auth";
import { solveIntent } from "../services/solver-engine";
import { autoSettleMatchedIntent } from "../services/auto-settlement-service";
import { db } from "../store/db";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/response";

const queueQuerySchema = z.object({
  status: z.enum(["open", "solving", "matched", "rejected", "expired"]).optional()
});

const solveSchema = z.object({
  intentId: z.string().uuid()
});

export const solverRoutes = Router();
solverRoutes.use(requireAuth);

solverRoutes.get("/queue", (req, res) => {
  const query = queueQuerySchema.parse(req.query);

  const intents = db.intents.filter((intent) => {
    if (query.status && intent.status !== query.status) {
      return false;
    }
    return true;
  });

  return sendSuccess(res, {
    solverMode: "system_solver",
    intents
  });
});

solverRoutes.post(
  "/solve",
  asyncHandler(async (req, res) => {
    const payload = solveSchema.parse(req.body);
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

    const requestedLender = intent.requestedLenderId
      ? db.agents.find((item) => item.id === intent.requestedLenderId) ?? null
      : null;
    const matchedLender = intent.matchedLenderId
      ? db.agents.find((item) => item.id === intent.matchedLenderId) ?? null
      : null;

    const canSolve =
      borrower.ownerUserId === req.auth!.userId ||
      (requestedLender?.ownerUserId === req.auth!.userId) ||
      (matchedLender?.ownerUserId === req.auth!.userId);

    if (req.auth!.provider === "agent_token") {
      const claimedAgentId = req.auth!.claimedAgentId;
      if (
        !claimedAgentId ||
        (claimedAgentId !== borrower.id &&
          claimedAgentId !== requestedLender?.id &&
          claimedAgentId !== matchedLender?.id)
      ) {
        throw new AppError("Agent token cannot solve another agent's intent.", {
          code: ERROR_CODES.FORBIDDEN,
          status: 403
        });
      }
    } else if (!canSolve) {
      throw new AppError("Cannot solve another user's intent.", {
        code: ERROR_CODES.FORBIDDEN,
        status: 403
      });
    }

    const solved = await solveIntent({
      intentId: payload.intentId,
      solverAgentId: null
    });

    let autoSettlement: Awaited<ReturnType<typeof autoSettleMatchedIntent>> | null = null;
    if (solved.decision.approved) {
      autoSettlement = await autoSettleMatchedIntent({
        intentId: solved.intent.id,
        userId: req.auth!.userId,
        provider: req.auth!.provider,
        claimedAgentId: req.auth!.claimedAgentId
      });
    }

    return sendSuccess(res, {
      intent: solved.intent,
      decision: solved.decision,
      autoSettlement,
      nextAction: !solved.decision.approved
        ? "no_match"
        : autoSettlement?.autoSettled
          ? "settled"
          : "matched_policy_or_balance_blocked"
    });
  })
);
