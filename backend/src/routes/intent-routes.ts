import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { requireAuth } from "../middleware/auth";
import { evaluateIntent } from "../services/matching-engine";
import { calculateDeterministicPricing } from "../services/pricing-engine";
import { solveIntent } from "../services/solver-engine";
import { autoSettleMatchedIntent } from "../services/auto-settlement-service";
import { db, saveDb } from "../store/db";
import type { BorrowIntent } from "../types/domain";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/response";

const assetEnum = z.enum(["USDT", "USAT", "XAUT", "BTC"]);

const recommendationSchema = z.object({
  agentId: z.string().uuid(),
  amount: z.number().positive(),
  asset: assetEnum.optional(),
  duration: z.number().int().positive(),
  maxInterest: z.number().positive().optional()
});

const borrowIntentSchema = recommendationSchema.extend({
  maxInterest: z.number().positive(),
  riskProfile: z.enum(["low", "medium", "high"]).optional()
});

const lendIntentSchema = z
  .object({
    lenderAgentId: z.string().uuid(),
    amount: z.number().positive().optional(),
    asset: assetEnum.optional(),
    duration: z.number().int().positive().optional(),
    maxInterest: z.number().positive().optional(),
    riskProfile: z.enum(["low", "medium", "high"]).optional(),
    autoRepayAfterMinutes: z.number().int().min(1).max(1440).optional(),
    request: z.string().min(6).max(180).optional()
  })
  .refine((payload) => typeof payload.amount === "number" || typeof payload.request === "string", {
    message: "amount or request must be provided"
  });

const matchSchema = z.object({
  intentId: z.string().uuid()
});

const LEND_REQUEST_RE = /lend\s+out\s+([0-9]+(?:\.[0-9]+)?)\s*(USDT|USAT|XAUT|BTC)?(?:\s*\((low|medium|high)\s*risk\))?/i;

function ensureClaimedAgentScopeOrThrow(params: {
  provider: "jwt" | "api_key" | "agent_token";
  claimedAgentId?: string | null;
  targetAgentId: string;
}) {
  if (params.provider !== "agent_token") {
    return;
  }

  if (!params.claimedAgentId || params.claimedAgentId !== params.targetAgentId) {
    throw new AppError("Agent token cannot operate other agents.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }
}

function getOwnedAgentOrThrow(agentId: string, userId: string) {
  const agent = db.agents.find((item) => item.id === agentId);

  if (!agent) {
    throw new AppError("Borrower agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  if (agent.ownerUserId !== userId) {
    throw new AppError("Cannot create intent for another user agent.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  if (agent.isDisabled) {
    throw new AppError("Disabled agent cannot create intent.", {
      code: ERROR_CODES.AGENT_DISABLED,
      status: 403
    });
  }

  return agent;
}

function buildVirtualIntent(input: {
  borrowerId: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  durationDays: number;
  maxInterest: number;
  riskProfile: "low" | "medium" | "high";
  recommendedInterest: number | null;
}): BorrowIntent {
  return {
    id: "preview_" + uuidv4(),
    borrowerId: input.borrowerId,
    source: "borrow_request",
    requestedLenderId: null,
    autoRepayAfterMinutes: null,
    amount: input.amount,
    asset: input.asset,
    durationDays: input.durationDays,
    maxInterest: input.maxInterest,
    riskProfile: input.riskProfile,
    recommendedInterest: input.recommendedInterest,
    timestamp: new Date().toISOString(),
    matchedLenderId: null,
    solverAgentId: null,
    solverReason: null,
    solverEvaluatedAt: null,
    humanApprovedAt: null,
    status: "open"
  };
}

function parseLendRequestText(request: string) {
  const match = request.match(LEND_REQUEST_RE);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const asset = (match[2]?.toUpperCase() as "USDT" | "USAT" | "XAUT" | "BTC" | undefined) ?? "USDT";
  const riskProfile = (match[3]?.toLowerCase() as "low" | "medium" | "high" | undefined) ?? "medium";

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    amount,
    asset,
    riskProfile
  };
}

function defaultMaxInterestByRisk(riskProfile: "low" | "medium" | "high") {
  if (riskProfile === "low") {
    return 8;
  }
  if (riskProfile === "medium") {
    return 12;
  }
  return 16;
}

export const intentRoutes = Router();
intentRoutes.use(requireAuth);

intentRoutes.post(
  "/recommend",
  asyncHandler(async (req, res) => {
    const payload = recommendationSchema.parse(req.body);
    const agent = getOwnedAgentOrThrow(payload.agentId, req.auth!.userId);
    ensureClaimedAgentScopeOrThrow({
      provider: req.auth!.provider,
      claimedAgentId: req.auth!.claimedAgentId,
      targetAgentId: agent.id
    });
    const pricing = calculateDeterministicPricing(agent);

    if (!pricing.approved || typeof pricing.interestRate !== "number" || !pricing.riskLevel) {
      return sendSuccess(res, {
        status: "rejected",
        reason: pricing.reason ?? "Pricing engine rejected current profile."
      });
    }

    const maxInterest = payload.maxInterest ?? Number((pricing.interestRate + 2).toFixed(2));
    const virtualIntent = buildVirtualIntent({
      borrowerId: agent.id,
      amount: payload.amount,
      asset: payload.asset ?? env.settlementAsset,
      durationDays: payload.duration,
      maxInterest,
      riskProfile: pricing.riskLevel,
      recommendedInterest: pricing.interestRate
    });
    const decision = await evaluateIntent(virtualIntent);

    return sendSuccess(res, {
      status: decision.approved ? "pending_user_approval" : "rejected",
      recommendation: decision.approved
        ? {
            amount: payload.amount,
            durationDays: payload.duration,
            asset: payload.asset ?? env.settlementAsset,
            interestRate: pricing.interestRate,
            riskLevel: pricing.riskLevel,
            maxInterest,
            recommendedCounterparty: decision.lenderId,
            reason: decision.reason
          }
        : null,
      reason: decision.reason
    });
  })
);

intentRoutes.post("/borrow", (req, res) => {
  const payload = borrowIntentSchema.parse(req.body);
  const agent = getOwnedAgentOrThrow(payload.agentId, req.auth!.userId);
  ensureClaimedAgentScopeOrThrow({
    provider: req.auth!.provider,
    claimedAgentId: req.auth!.claimedAgentId,
    targetAgentId: agent.id
  });

  const pricing = calculateDeterministicPricing(agent);
  if (!pricing.approved || typeof pricing.interestRate !== "number" || !pricing.riskLevel) {
    throw new AppError(pricing.reason ?? "Pricing engine rejected current profile.", {
      code: ERROR_CODES.MATCH_NOT_FOUND,
      status: 422
    });
  }

  if (payload.maxInterest < pricing.interestRate) {
    throw new AppError(
      `Requested maxInterest ${payload.maxInterest}% is below deterministic rate ${pricing.interestRate}%.`,
      {
        code: ERROR_CODES.MATCH_NOT_FOUND,
        status: 422
      }
    );
  }

  const intent: BorrowIntent = {
    id: uuidv4(),
    borrowerId: agent.id,
    source: "borrow_request",
    requestedLenderId: null,
    autoRepayAfterMinutes: null,
    amount: payload.amount,
    asset: payload.asset ?? env.settlementAsset,
    durationDays: payload.duration,
    maxInterest: payload.maxInterest,
    riskProfile: payload.riskProfile ?? pricing.riskLevel,
    recommendedInterest: pricing.interestRate,
    timestamp: new Date().toISOString(),
    matchedLenderId: null,
    solverAgentId: null,
    solverReason: null,
    solverEvaluatedAt: null,
    humanApprovedAt: null,
    status: "open"
  };

  db.intents.push(intent);
  saveDb();

  return sendSuccess(
    res,
    {
      intent
    },
    201
  );
});

intentRoutes.post("/lend", (req, res) => {
  const payload = lendIntentSchema.parse(req.body);
  const lender = getOwnedAgentOrThrow(payload.lenderAgentId, req.auth!.userId);
  ensureClaimedAgentScopeOrThrow({
    provider: req.auth!.provider,
    claimedAgentId: req.auth!.claimedAgentId,
    targetAgentId: lender.id
  });

  const parsedRequest = payload.request ? parseLendRequestText(payload.request) : null;
  const amount = payload.amount ?? parsedRequest?.amount;
  if (!amount || amount <= 0) {
    throw new AppError("Cannot parse lend request amount. Please provide numeric amount.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  const riskProfile = payload.riskProfile ?? parsedRequest?.riskProfile ?? "medium";
  const asset = payload.asset ?? parsedRequest?.asset ?? env.settlementAsset;
  const maxInterest = payload.maxInterest ?? defaultMaxInterestByRisk(riskProfile);

  const intent: BorrowIntent = {
    id: uuidv4(),
    // Placeholder before solver chooses borrower.
    borrowerId: lender.id,
    source: "lend_request",
    requestedLenderId: lender.id,
    autoRepayAfterMinutes: payload.autoRepayAfterMinutes ?? 5,
    amount,
    asset,
    durationDays: payload.duration ?? 7,
    maxInterest,
    riskProfile,
    recommendedInterest: null,
    timestamp: new Date().toISOString(),
    matchedLenderId: null,
    solverAgentId: null,
    solverReason: null,
    solverEvaluatedAt: null,
    humanApprovedAt: null,
    status: "open"
  };

  db.intents.push(intent);
  saveDb();

  return sendSuccess(
    res,
    {
      intent
    },
    201
  );
});

intentRoutes.post(
  "/match",
  asyncHandler(async (req, res) => {
    const payload = matchSchema.parse(req.body);
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

    const canMatch =
      borrower.ownerUserId === req.auth!.userId ||
      (requestedLender?.ownerUserId === req.auth!.userId) ||
      (matchedLender?.ownerUserId === req.auth!.userId);

    if (!canMatch) {
      throw new AppError("Cannot match intent for another user.", {
        code: ERROR_CODES.FORBIDDEN,
        status: 403
      });
    }
    if (req.auth!.provider === "agent_token") {
      const claimedAgentId = req.auth!.claimedAgentId;
      if (
        !claimedAgentId ||
        (claimedAgentId !== borrower.id &&
          claimedAgentId !== requestedLender?.id &&
          claimedAgentId !== matchedLender?.id)
      ) {
        throw new AppError("Agent token cannot match another agent's intent.", {
          code: ERROR_CODES.FORBIDDEN,
          status: 403
        });
      }
    }

    if (borrower.isDisabled) {
      throw new AppError("Disabled agent cannot match intent.", {
        code: ERROR_CODES.AGENT_DISABLED,
        status: 403
      });
    }

    const solved = await solveIntent({
      intentId: intent.id,
      solverAgentId: null
    });

    if (
      !solved.decision.approved ||
      !solved.decision.lenderId ||
      typeof solved.decision.offeredInterest !== "number"
    ) {
      throw new AppError(solved.decision.reason, {
        code: ERROR_CODES.MATCH_NOT_FOUND,
        status: 422,
        details: solved.decision
      });
    }

    const autoSettlement = await autoSettleMatchedIntent({
      intentId: solved.intent.id,
      userId: req.auth!.userId,
      provider: req.auth!.provider,
      claimedAgentId: req.auth!.claimedAgentId
    });

    return sendSuccess(res, {
      intentId: solved.intent.id,
      matchedLenderId: solved.decision.lenderId,
      offeredInterest: solved.decision.offeredInterest,
      reason: solved.decision.reason,
      autoSettlement
    });
  })
);

intentRoutes.get("/", (req, res) => {
  const userId = req.auth!.userId;
  const userAgents = db.agents.filter((item) => item.ownerUserId === userId).map((item) => item.id);
  const userAgentSet = new Set(userAgents);
  const intents = db.intents.filter(
    (item) =>
      userAgentSet.has(item.borrowerId) ||
      (!!item.requestedLenderId && userAgentSet.has(item.requestedLenderId)) ||
      (!!item.matchedLenderId && userAgentSet.has(item.matchedLenderId))
  );

  return sendSuccess(res, { intents });
});
