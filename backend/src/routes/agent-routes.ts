import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { claimAgent, ensureAllClaimsHaveAgent, getAgentClaimStatus, registerAgentClaim } from "../services/agent-claim-service";
import { runAutonomyTick } from "../services/autonomy-engine";
import { getAutonomyPolicy, upsertAutonomyPolicy } from "../services/policy-engine";
import { solveIntent } from "../services/solver-engine";
import { wdkAdapter } from "../services/wdk-adapter";
import { db, saveDb } from "../store/db";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/response";

const createAgentSchema = z.object({
  name: z.string().min(2).max(64)
});

const registerClaimSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().min(3).max(240).default("Autonomous agent profile")
});

const claimSchema = z.object({
  agentToken: z.string().min(12),
  verificationCode: z.string().min(6).max(24)
});

const autonomyTickSchema = z.object({
  agentId: z.string().uuid().optional()
});

const autonomyHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const autonomyModeSchema = z.object({
  autoEnabled: z.boolean()
});

const autonomyPolicySchema = z.object({
  autoBorrowEnabled: z.boolean().optional(),
  autoRepayEnabled: z.boolean().optional(),
  borrowMaxAmount: z.number().positive().optional(),
  borrowMaxInterest: z.number().positive().optional(),
  allowedRiskProfiles: z.array(z.enum(["low", "medium", "high"])).min(1).optional()
});

const demoBootstrapSchema = z.object({
  runAutonomy: z.boolean().default(false)
});

const DEMO_LOW_MODE_MIN_TX = 10;
const DEMO_LOW_MODE_MAX_TX = 100;
const DEMO_LOW_MODE_BORROWER_BUFFER = 20;
const DEMO_INTENT_AMOUNT_A = 20;
const DEMO_INTENT_AMOUNT_B = 30;
const DEMO_KNOWLEDGE_COST = 2;
const DEMO_KNOWLEDGE_BUFFER = 5;

function getBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export const agentRoutes = Router();

agentRoutes.post("/register", (req, res) => {
  const payload = registerClaimSchema.parse(req.body);
  const result = registerAgentClaim({
    name: payload.name,
    description: payload.description
  });

  return sendSuccess(
    res,
    {
      agent: {
        id: result.claim.id,
        name: result.claim.agentName,
        description: result.claim.description,
        apiKey: result.claim.agentToken,
        authToken: result.claim.agentToken,
        claimUrl: result.claimUrl,
        verificationCode: result.claim.verificationCode,
        status: result.claim.status
      },
      important: "Save authToken immediately. After claim, you can use it as Bearer token for agent APIs."
    },
    201
  );
});

agentRoutes.get("/status", (req, res) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    throw new AppError("Missing or invalid authorization header.", {
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401
    });
  }

  const status = getAgentClaimStatus(token);
  return sendSuccess(res, status);
});

agentRoutes.post(
  "/claim",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = claimSchema.parse(req.body);
    const claimed = await claimAgent({
      agentToken: payload.agentToken,
      verificationCode: payload.verificationCode,
      userId: req.auth!.userId
    });

    return sendSuccess(res, {
      claim: {
        id: claimed.claim.id,
        name: claimed.claim.agentName,
        status: claimed.claim.status,
        claimedAt: claimed.claim.claimedAt,
        claimedByUserId: claimed.claim.claimedByUserId,
        claimedAgentId: claimed.claim.claimedAgentId
      },
      agent: claimed.agent,
      authToken: claimed.claim.agentToken
    });
  })
);

agentRoutes.post(
  "/autonomy/tick",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = autonomyTickSchema.parse(req.body ?? {});
    const requestedAgentId = payload.agentId ?? null;
    const scopedAgentId =
      req.auth!.provider === "agent_token" ? req.auth!.claimedAgentId ?? null : requestedAgentId;

    if (req.auth!.provider === "agent_token" && !req.auth!.claimedAgentId) {
      throw new AppError("Claimed agent token is required for agent autonomy calls.", {
        code: ERROR_CODES.FORBIDDEN,
        status: 403
      });
    }

    if (requestedAgentId && req.auth!.provider === "agent_token" && requestedAgentId !== req.auth!.claimedAgentId) {
      throw new AppError("Agent token cannot run autonomy for another agent.", {
        code: ERROR_CODES.FORBIDDEN,
        status: 403
      });
    }

    if (scopedAgentId) {
      const agent = db.agents.find((item) => item.id === scopedAgentId);
      if (!agent) {
        throw new AppError("Agent not found.", {
          code: ERROR_CODES.AGENT_NOT_FOUND,
          status: 404
        });
      }
      if (agent.ownerUserId !== req.auth!.userId) {
        throw new AppError("Cannot run autonomy for another user's agent.", {
          code: ERROR_CODES.FORBIDDEN,
          status: 403
        });
      }
      if (agent.isDisabled) {
        throw new AppError("Disabled agents cannot run autonomy.", {
          code: ERROR_CODES.AGENT_DISABLED,
          status: 403
        });
      }
    }

    const report = await runAutonomyTick({
      ownerUserId: req.auth!.userId,
      agentId: scopedAgentId
    });

    return sendSuccess(res, {
      report
    });
  })
);

agentRoutes.get("/autonomy/history", requireAuth, (req, res) => {
  const query = autonomyHistoryQuerySchema.parse(req.query ?? {});
  const ownerUserId = req.auth!.userId;
  const reports = db.autonomyTickReports
    .filter((item) => item.report.ownerUserId === ownerUserId)
    .sort((a, b) => +new Date(b.report.processedAt) - +new Date(a.report.processedAt))
    .slice(0, query.limit);

  return sendSuccess(res, {
    reports
  });
});

agentRoutes.get("/autonomy/mode", requireAuth, (_req, res) => {
  return sendSuccess(res, {
    autoEnabled: db.runtimeMode.autoEnabled,
    mode: db.runtimeMode.autoEnabled ? "auto" : "manual",
    updatedAt: db.runtimeMode.updatedAt
  });
});

agentRoutes.get("/policy", requireAuth, (req, res) => {
  const policy = getAutonomyPolicy(req.auth!.userId);
  return sendSuccess(res, {
    policy
  });
});

agentRoutes.post("/policy", requireAuth, (req, res) => {
  if (req.auth!.provider === "agent_token") {
    throw new AppError("Autonomy policy must be configured by user authentication.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  const payload = autonomyPolicySchema.parse(req.body ?? {});
  const policy = upsertAutonomyPolicy(req.auth!.userId, payload);
  return sendSuccess(res, {
    policy
  });
});

agentRoutes.post("/autonomy/mode", requireAuth, requireAdmin, (req, res) => {
  const payload = autonomyModeSchema.parse(req.body ?? {});
  db.runtimeMode.autoEnabled = payload.autoEnabled;
  db.runtimeMode.updatedAt = new Date().toISOString();
  saveDb();

  return sendSuccess(res, {
    autoEnabled: db.runtimeMode.autoEnabled,
    mode: db.runtimeMode.autoEnabled ? "auto" : "manual",
    updatedAt: db.runtimeMode.updatedAt
  });
});

agentRoutes.post(
  "/demo/bootstrap",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = demoBootstrapSchema.parse(req.body ?? {});
    const ownerUserId = req.auth!.userId;

    const userAgents = db.agents.filter((item) => item.ownerUserId === ownerUserId);
    const treasuryWallet = db.wallets.find((item) => item.ownerAgentId === null);

    async function ensureAgent(name: string) {
      const existing = userAgents.find((item) => item.name === name);
      if (existing) {
        return existing;
      }

      const agentId = uuidv4();
      const wallet = await wdkAdapter.createWallet(agentId);
      const now = new Date().toISOString();

      const agent = {
        id: agentId,
        ownerUserId,
        name,
        walletAddress: wallet.address,
        reputationScore: 50,
        knowledgeScore: 50,
        teachingScore: 50,
        creditScore: 50,
        incomeHistory: [],
        repaymentHistory: [],
        defaultEvents: 0,
        isDisabled: false,
        disabledAt: null,
        createdAt: now,
        updatedAt: now
      };
      db.agents.push(agent);
      userAgents.push(agent);
      saveDb();

      return agent;
    }

    const borrower = await ensureAgent("Borrow Demo Agent A");
    const lender = await ensureAgent("Lend Demo Agent A");
    const borrowerB = await ensureAgent("Borrow Demo Agent B");
    const lenderB = await ensureAgent("Lend Demo Agent B");

    if (treasuryWallet) {
      for (const lenderWallet of [lender.walletAddress, lenderB.walletAddress]) {
        const lenderBalance = await wdkAdapter.getBalance(lenderWallet, env.settlementAsset);
        const lenderDeficit = Number((DEMO_LOW_MODE_MAX_TX - lenderBalance).toFixed(2));
        if (lenderDeficit >= DEMO_LOW_MODE_MIN_TX) {
          await wdkAdapter.sendTransaction({
            fromAddress: treasuryWallet.address,
            toAddress: lenderWallet,
            amount: lenderDeficit,
            asset: env.settlementAsset,
            initiatedBy: "system"
          });
        }
      }

      for (const borrowerWallet of [borrower.walletAddress, borrowerB.walletAddress]) {
        const borrowerBalance = await wdkAdapter.getBalance(borrowerWallet, env.settlementAsset);
        if (borrowerBalance < DEMO_LOW_MODE_BORROWER_BUFFER) {
          const borrowerTopUp = Number(
            Math.max(
              DEMO_LOW_MODE_MIN_TX,
              Math.min(DEMO_LOW_MODE_MAX_TX, DEMO_LOW_MODE_BORROWER_BUFFER - borrowerBalance)
            ).toFixed(2)
          );
          if (borrowerTopUp >= DEMO_LOW_MODE_MIN_TX) {
            await wdkAdapter.sendTransaction({
              fromAddress: treasuryWallet.address,
              toAddress: borrowerWallet,
              amount: borrowerTopUp,
              asset: env.settlementAsset,
              initiatedBy: "system"
            });
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    const before = {
      borrowerCredit: borrower.creditScore,
      borrowerKnowledge: borrower.knowledgeScore,
      lenderTeaching: lender.teachingScore,
      borrowerCreditToken: await wdkAdapter.getCreditTokenBalance(borrower.walletAddress),
      lenderCreditToken: await wdkAdapter.getCreditTokenBalance(lender.walletAddress)
    };

    const knowledge = {
      id: uuidv4(),
      authorAgentId: lender.id,
      title: `Demo Knowledge ${new Date().toISOString()}`,
      content:
        "Demo chain: publish knowledge -> learn knowledge -> learner earns credit/knowledge and provider earns credit token.",
      tokenCost: DEMO_KNOWLEDGE_COST,
      rewardCredit: 1,
      rewardKnowledge: 1,
      approvalStatus: "approved" as const,
      isCancelled: false,
      cancelledAt: null,
      cancelledByUserId: null,
      reviewedAt: nowIso,
      reviewedByUserId: null,
      reviewNote: "Auto-approved by demo bootstrap.",
      createdAt: nowIso,
      updatedAt: nowIso
    };

    lender.teachingScore += 1;
    db.knowledgePoints.push(knowledge);

    const borrowerCreditTokenBalance = await wdkAdapter.getCreditTokenBalance(borrower.walletAddress);
    if (borrowerCreditTokenBalance < knowledge.tokenCost) {
      const topUpAmount = Number((knowledge.tokenCost - borrowerCreditTokenBalance + DEMO_KNOWLEDGE_BUFFER).toFixed(2));
      await wdkAdapter.transferCreditToken({
        fromAddress: lender.walletAddress,
        toAddress: borrower.walletAddress,
        amount: topUpAmount,
        reason: "demo-credit-token-topup"
      });
    }

    const creditTokenSettlement = await wdkAdapter.transferCreditToken({
      fromAddress: borrower.walletAddress,
      toAddress: lender.walletAddress,
      amount: knowledge.tokenCost,
      reason: `demo-knowledge:${knowledge.id}`
    });

    borrower.knowledgeScore += knowledge.rewardKnowledge;
    borrower.creditScore += knowledge.rewardCredit;

    db.knowledgeLearnings.push({
      id: uuidv4(),
      knowledgeId: knowledge.id,
      learnerAgentId: borrower.id,
      providerAgentId: lender.id,
      tokenPaid: knowledge.tokenCost,
      txId: creditTokenSettlement.transferId,
      createdAt: nowIso
    });

    const after = {
      borrowerCredit: borrower.creditScore,
      borrowerKnowledge: borrower.knowledgeScore,
      lenderTeaching: lender.teachingScore,
      borrowerCreditToken: await wdkAdapter.getCreditTokenBalance(borrower.walletAddress),
      lenderCreditToken: await wdkAdapter.getCreditTokenBalance(lender.walletAddress)
    };

    const demoBorrowerIds = new Set([borrower.id, borrowerB.id]);
    for (const existingIntent of db.intents) {
      if (!demoBorrowerIds.has(existingIntent.borrowerId)) {
        continue;
      }
      if (existingIntent.status !== "open" && existingIntent.status !== "solving" && existingIntent.status !== "matched") {
        continue;
      }
      const hasLinkedLoan = db.loans.some((loan) => loan.intentId === existingIntent.id);
      if (hasLinkedLoan) {
        continue;
      }
      existingIntent.status = "expired";
    }

    const demoIntents = [
      {
        id: uuidv4(),
        borrowerId: borrower.id,
        amount: DEMO_INTENT_AMOUNT_A
      },
      {
        id: uuidv4(),
        borrowerId: borrowerB.id,
        amount: DEMO_INTENT_AMOUNT_B
      }
    ].map((seed) => ({
      id: seed.id,
      borrowerId: seed.borrowerId,
      amount: seed.amount,
      asset: env.settlementAsset,
      durationDays: 7,
      maxInterest: 12,
      riskProfile: "low" as const,
      recommendedInterest: null,
      timestamp: new Date().toISOString(),
      matchedLenderId: null,
      solverAgentId: null,
      solverReason: null,
      solverEvaluatedAt: null,
      humanApprovedAt: null,
      status: "open" as const
    }));
    db.intents.push(...demoIntents);

    const demoLifecycleActions: Awaited<ReturnType<typeof runAutonomyTick>>["actions"] = [];

    for (const intent of demoIntents) {
      demoLifecycleActions.push({
        type: "borrow_intent_created",
        agentId: intent.borrowerId,
        message: `Intent ${intent.id.slice(0, 8)} created (${intent.asset} ${intent.amount}).`,
        refId: intent.id
      });

      const solved = await solveIntent({
        intentId: intent.id,
        solverAgentId: null
      });

      if (!solved.decision.approved || !solved.decision.lenderId) {
        demoLifecycleActions.push({
          type: "demo_intent_rejected",
          agentId: intent.borrowerId,
          message: `Intent ${intent.id.slice(0, 8)} rejected: ${solved.decision.reason}`,
          refId: intent.id
        });
        continue;
      }

      demoLifecycleActions.push({
        type: "demo_intent_matched",
        agentId: intent.borrowerId,
        message: `Intent ${intent.id.slice(0, 8)} matched with lender ${solved.decision.lenderId.slice(0, 8)}.`,
        refId: intent.id
      });
      demoLifecycleActions.push({
        type: "loan_ready_for_approval",
        agentId: intent.borrowerId,
        message: `Intent ${intent.id.slice(0, 8)} is matched and waiting for human approval (POST /loan/execute).`,
        refId: intent.id
      });
    }

    let report: Awaited<ReturnType<typeof runAutonomyTick>> = {
      processedAt: new Date().toISOString(),
      ownerUserId,
      actions: [
        {
          type: "demo_knowledge_published",
          agentId: lender.id,
          message: `Published knowledge "${knowledge.title}" and teaching increased by +1.`
        },
        {
          type: "demo_knowledge_learned",
          agentId: borrower.id,
          message: "Learned knowledge and gained credit +1, knowledge +1."
        },
        {
          type: "demo_token_earned",
          agentId: lender.id,
          message: `Publisher received ${knowledge.tokenCost} credit token from learner.`
        },
        ...demoLifecycleActions
      ]
    };

    if (payload.runAutonomy) {
      const tick = await runAutonomyTick({ ownerUserId });
      report = {
        processedAt: tick.processedAt,
        ownerUserId: tick.ownerUserId,
        actions: [...report.actions, ...tick.actions]
      };
    }

    db.autonomyTickReports.push({
      id: uuidv4(),
      report
    });
    if (db.autonomyTickReports.length > 500) {
      db.autonomyTickReports.splice(0, db.autonomyTickReports.length - 500);
    }

    const matchedCount = demoLifecycleActions.filter((item) => item.type === "demo_intent_matched").length;
    const pendingApprovalCount = demoLifecycleActions.filter((item) => item.type === "loan_ready_for_approval").length;

    saveDb();

    return sendSuccess(res, {
      agents: db.agents.filter((item) => item.ownerUserId === ownerUserId),
      report,
      demoSummary: {
        knowledgeId: knowledge.id,
        tokenCost: knowledge.tokenCost,
        tokenType: "credit_token",
        matchedCount,
        pendingApprovalCount,
        borrower: {
          id: borrower.id,
          beforeCredit: before.borrowerCredit,
          afterCredit: after.borrowerCredit,
          beforeKnowledge: before.borrowerKnowledge,
          afterKnowledge: after.borrowerKnowledge,
          beforeCreditToken: before.borrowerCreditToken,
          afterCreditToken: after.borrowerCreditToken
        },
        lender: {
          id: lender.id,
          beforeTeaching: before.lenderTeaching,
          afterTeaching: after.lenderTeaching,
          beforeCreditToken: before.lenderCreditToken,
          afterCreditToken: after.lenderCreditToken
        }
      }
    });
  })
);

agentRoutes.post(
  "/create",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = createAgentSchema.parse(req.body);
    const ownerUserId = req.auth!.userId;
    const agentId = uuidv4();
    const wallet = await wdkAdapter.createWallet(agentId);

    const agent = {
      id: agentId,
      ownerUserId,
      name: payload.name,
      walletAddress: wallet.address,
      reputationScore: 50,
      knowledgeScore: 50,
      teachingScore: 50,
      creditScore: 50,
      incomeHistory: [],
      repaymentHistory: [],
      defaultEvents: 0,
      isDisabled: false,
      disabledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.agents.push(agent);
    saveDb();

    return sendSuccess(
      res,
      {
        agent
      },
      201
    );
  })
);

agentRoutes.get("/:id", requireAuth, (req, res) => {
  const agent = db.agents.find((item) => item.id === req.params.id);

  if (!agent) {
    throw new AppError("Agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  if (agent.ownerUserId !== req.auth!.userId) {
    throw new AppError("Cannot view another user's agent.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  return sendSuccess(res, { agent });
});

agentRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.auth!.userId;
    await ensureAllClaimsHaveAgent(userId);
    const agents = db.agents.filter((item) => item.ownerUserId === userId);
    return sendSuccess(res, { agents });
  })
);
