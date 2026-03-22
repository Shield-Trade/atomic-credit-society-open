import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { ERROR_CODES } from "../constants/error-codes";
import { requireAuth } from "../middleware/auth";
import { applyCreditUpdate } from "../services/credit-engine";
import { wdkAdapter } from "../services/wdk-adapter";
import { db, saveDb } from "../store/db";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/response";

const updateCreditSchema = z.object({
  agentId: z.string().uuid(),
  learningSessions: z.number().int().min(0).optional(),
  successfulTeaching: z.number().int().min(0).optional(),
  incomeAmount: z.number().positive().optional(),
  incomeSource: z.enum(["teaching", "system_reward", "other"]).optional(),
  repayment: z
    .object({
      loanId: z.string(),
      amount: z.number().positive(),
      onTime: z.boolean().default(true)
    })
    .optional(),
  defaulted: z.boolean().optional()
});

export const creditRoutes = Router();
creditRoutes.use(requireAuth);

creditRoutes.get("/:agentId", (req, res) => {
  const agent = db.agents.find((item) => item.id === req.params.agentId);

  if (!agent) {
    throw new AppError("Agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  if (agent.ownerUserId !== req.auth!.userId) {
    throw new AppError("Cannot view another user's credit profile.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  if (agent.isDisabled) {
    throw new AppError("Disabled agent cannot update credit profile.", {
      code: ERROR_CODES.AGENT_DISABLED,
      status: 403
    });
  }

  return sendSuccess(res, {
    agentId: agent.id,
    creditScore: agent.creditScore,
    knowledgeScore: agent.knowledgeScore,
    teachingScore: agent.teachingScore,
    repaymentEvents: agent.repaymentHistory.length,
    incomeEvents: agent.incomeHistory.length,
    defaultEvents: agent.defaultEvents
  });
});

creditRoutes.post(
  "/update",
  asyncHandler(async (req, res) => {
    const payload = updateCreditSchema.parse(req.body);
    const agent = db.agents.find((item) => item.id === payload.agentId);

    if (!agent) {
      throw new AppError("Agent not found.", {
        code: ERROR_CODES.AGENT_NOT_FOUND,
        status: 404
      });
    }

    if (agent.ownerUserId !== req.auth!.userId) {
      throw new AppError("Cannot update another user's credit profile.", {
        code: ERROR_CODES.FORBIDDEN,
        status: 403
      });
    }

    if (typeof payload.learningSessions === "number") {
      agent.knowledgeScore += payload.learningSessions;
      agent.reputationScore += Math.ceil(payload.learningSessions / 2);
    }

    if (typeof payload.successfulTeaching === "number") {
      agent.teachingScore += payload.successfulTeaching;
      agent.reputationScore += payload.successfulTeaching;
    }

    if (typeof payload.incomeAmount === "number") {
      agent.incomeHistory.push({
        amount: payload.incomeAmount,
        source: payload.incomeSource ?? "other",
        timestamp: new Date().toISOString()
      });

      const treasuryWallet = db.wallets.find((item) => item.ownerAgentId === null);
      if (treasuryWallet) {
        await wdkAdapter.sendTransaction({
          fromAddress: treasuryWallet.address,
          toAddress: agent.walletAddress,
          amount: payload.incomeAmount,
          asset: env.settlementAsset,
          initiatedBy: "system"
        });
      }
    }

    if (payload.repayment) {
      agent.repaymentHistory.push({
        loanId: payload.repayment.loanId,
        amount: payload.repayment.amount,
        onTime: payload.repayment.onTime,
        timestamp: new Date().toISOString()
      });
    }

    if (payload.defaulted) {
      agent.defaultEvents += 1;
    }

    applyCreditUpdate(agent);
    saveDb();

    return sendSuccess(res, {
      agentId: agent.id,
      creditScore: agent.creditScore,
      knowledgeScore: agent.knowledgeScore,
      teachingScore: agent.teachingScore,
      defaultEvents: agent.defaultEvents
    });
  })
);
