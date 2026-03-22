import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ERROR_CODES } from "../constants/error-codes";
import { requireAuth } from "../middleware/auth";
import { db, saveDb } from "../store/db";
import { AppError } from "../utils/app-error";
import { sendSuccess } from "../utils/response";
import { wdkAdapter } from "../services/wdk-adapter";
import { asyncHandler } from "../utils/async-handler";

const publishSchema = z.object({
  agentId: z.string().uuid(),
  title: z.string().min(2).max(120),
  content: z.string().min(10).max(4000),
  tokenCost: z.number().int().min(1).max(5),
  rewardCredit: z.number().int().min(1).max(1).default(1)
});

const learnSchema = z.object({
  knowledgeId: z.string().uuid(),
  learnerAgentId: z.string().uuid()
});

const listQuerySchema = z.object({
  agentId: z.string().uuid().optional()
});

const knowledgeIdParamSchema = z.object({
  id: z.string().uuid()
});

function getOwnedAgent(agentId: string, userId: string) {
  const agent = db.agents.find((item) => item.id === agentId);
  if (!agent) {
    throw new AppError("Agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }
  if (agent.ownerUserId !== userId) {
    throw new AppError("Cannot access another user's agent.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }
  if (agent.isDisabled) {
    throw new AppError("Disabled agent cannot operate knowledge actions.", {
      code: ERROR_CODES.AGENT_DISABLED,
      status: 403
    });
  }
  return agent;
}

function formatKnowledgeRow(item: {
  id: string;
  authorAgentId: string;
  title: string;
  content: string;
  tokenCost: number;
  rewardCredit: number;
  rewardKnowledge: number;
  approvalStatus: "pending" | "approved" | "rejected";
  isCancelled: boolean;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  const author = db.agents.find((agent) => agent.id === item.authorAgentId);
  return {
    ...item,
    authorName: author?.name ?? "unknown",
    authorWalletAddress: author?.walletAddress ?? null
  };
}

export const knowledgeRoutes = Router();
knowledgeRoutes.use(requireAuth);

knowledgeRoutes.post("/publish", (req, res) => {
  const payload = publishSchema.parse(req.body);
  const author = getOwnedAgent(payload.agentId, req.auth!.userId);

  const knowledge = {
    id: uuidv4(),
    authorAgentId: author.id,
    title: payload.title.trim(),
    content: payload.content.trim(),
    tokenCost: payload.tokenCost,
    rewardCredit: 1,
    rewardKnowledge: 1,
    approvalStatus: "pending" as const,
    isCancelled: false,
    cancelledAt: null,
    cancelledByUserId: null,
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  author.teachingScore += 1;
  db.knowledgePoints.push(knowledge);
  saveDb();

  return sendSuccess(
    res,
    {
      knowledge: formatKnowledgeRow(knowledge),
      updatedAuthor: {
        id: author.id,
        teachingScore: author.teachingScore
      }
    },
    201
  );
});

knowledgeRoutes.get("/mine", (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const ownerId = req.auth!.userId;
  const ownedAgentIds = db.agents.filter((agent) => agent.ownerUserId === ownerId).map((agent) => agent.id);
  const scopedAgentIds = query.agentId ? [query.agentId] : ownedAgentIds;

  if (query.agentId && !ownedAgentIds.includes(query.agentId)) {
    throw new AppError("Cannot access another user's knowledge list.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  const items = db.knowledgePoints
    .filter((item) => !item.isCancelled)
    .filter((item) => scopedAgentIds.includes(item.authorAgentId))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map(formatKnowledgeRow);

  return sendSuccess(res, {
    items
  });
});

knowledgeRoutes.get("/pool", (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const ownerId = req.auth!.userId;
  const ownedAgentIds = db.agents.filter((agent) => agent.ownerUserId === ownerId).map((agent) => agent.id);

  const items = db.knowledgePoints
    .filter((item) => !item.isCancelled)
    .filter((item) => !ownedAgentIds.includes(item.authorAgentId))
    .filter((item) => item.approvalStatus === "approved")
    .filter((item) => {
      if (!query.agentId) {
        return true;
      }
      return item.authorAgentId === query.agentId;
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => {
      const learnedByOwnedAgent = db.knowledgeLearnings.some(
        (record) => record.knowledgeId === item.id && ownedAgentIds.includes(record.learnerAgentId)
      );
      return {
        ...formatKnowledgeRow(item),
        learnedByOwnedAgent
      };
    });

  return sendSuccess(res, {
    items
  });
});

knowledgeRoutes.post(
  "/learn",
  asyncHandler(async (req, res) => {
    const payload = learnSchema.parse(req.body);
    const learner = getOwnedAgent(payload.learnerAgentId, req.auth!.userId);
    const knowledge = db.knowledgePoints.find((item) => item.id === payload.knowledgeId);

    if (!knowledge) {
      throw new AppError("Knowledge point not found.", {
        code: ERROR_CODES.BAD_REQUEST,
        status: 404
      });
    }

    if (knowledge.isCancelled) {
      throw new AppError("Knowledge point not found.", {
        code: ERROR_CODES.BAD_REQUEST,
        status: 404
      });
    }

    if (knowledge.approvalStatus !== "approved") {
      throw new AppError("Knowledge is pending admin approval.", {
        code: ERROR_CODES.KNOWLEDGE_NOT_APPROVED,
        status: 403
      });
    }

    if (knowledge.authorAgentId === learner.id) {
      throw new AppError("Agent cannot learn its own knowledge point.", {
        code: ERROR_CODES.BAD_REQUEST,
        status: 400
      });
    }

    const alreadyLearned = db.knowledgeLearnings.some(
      (record) => record.knowledgeId === knowledge.id && record.learnerAgentId === learner.id
    );
    if (alreadyLearned) {
      throw new AppError("This knowledge point has already been learned by the selected agent.", {
        code: ERROR_CODES.BAD_REQUEST,
        status: 409
      });
    }

    const provider = db.agents.find((item) => item.id === knowledge.authorAgentId);
    if (!provider) {
      throw new AppError("Knowledge provider agent not found.", {
        code: ERROR_CODES.AGENT_NOT_FOUND,
        status: 404
      });
    }
    if (provider.isDisabled) {
      throw new AppError("Knowledge provider is disabled.", {
        code: ERROR_CODES.AGENT_DISABLED,
        status: 403
      });
    }

    const settlement = await wdkAdapter.transferCreditToken({
      fromAddress: learner.walletAddress,
      toAddress: provider.walletAddress,
      amount: knowledge.tokenCost,
      reason: `knowledge:${knowledge.id}`
    });

    learner.knowledgeScore += knowledge.rewardKnowledge;
    learner.creditScore += knowledge.rewardCredit;

    const learningRecord = {
      id: uuidv4(),
      knowledgeId: knowledge.id,
      learnerAgentId: learner.id,
      providerAgentId: provider.id,
      tokenPaid: knowledge.tokenCost,
      txId: settlement.transferId,
      createdAt: new Date().toISOString()
    };
    db.knowledgeLearnings.push(learningRecord);
    saveDb();

    return sendSuccess(res, {
      learning: learningRecord,
      learner: {
        id: learner.id,
        knowledgeScore: learner.knowledgeScore,
        creditScore: learner.creditScore
      },
      settlement: {
        transferId: settlement.transferId,
        amount: settlement.amount,
        reason: settlement.reason,
        timestamp: settlement.timestamp
      }
    });
  })
);

knowledgeRoutes.delete("/:id", (req, res) => {
  const params = knowledgeIdParamSchema.parse(req.params);
  const knowledge = db.knowledgePoints.find((item) => item.id === params.id);

  if (!knowledge || knowledge.isCancelled) {
    throw new AppError("Knowledge point not found.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 404
    });
  }

  const author = db.agents.find((agent) => agent.id === knowledge.authorAgentId);
  if (!author) {
    throw new AppError("Knowledge provider agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  if (author.ownerUserId !== req.auth!.userId) {
    throw new AppError("Cannot cancel another user's knowledge point.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  knowledge.isCancelled = true;
  knowledge.cancelledAt = new Date().toISOString();
  knowledge.cancelledByUserId = req.auth!.userId;
  knowledge.updatedAt = knowledge.cancelledAt;
  saveDb();

  return sendSuccess(res, {
    cancelledKnowledgeId: knowledge.id
  });
});
