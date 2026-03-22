import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db, pruneDomainData, saveDb } from "../store/db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { sendSuccess } from "../utils/response";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import { hashPassword } from "../utils/password";
import { ADMIN_EMAILS, isAdminEmail } from "../constants/admin";
import type { KnowledgeApprovalStatus, UserRole } from "../types/domain";
import { ensureTreasuryWallet } from "../services/wdk-adapter";
import { asyncHandler } from "../utils/async-handler";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["user", "admin"]).optional()
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["user", "admin"]).optional()
});

const updateAgentSchema = z
  .object({
    isDisabled: z.boolean().optional(),
    name: z.string().min(2).max(64).optional()
  })
  .refine((payload) => typeof payload.isDisabled === "boolean" || typeof payload.name === "string", {
    message: "At least one field must be provided."
  });

const pruneSystemSchema = z.object({
  preserveUserEmails: z.array(z.string().email()).optional()
});

const reviewKnowledgeSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z
    .string()
    .max(400)
    .optional()
});

function resolveRole(email: string, requestedRole?: UserRole) {
  if (isAdminEmail(email)) {
    return "admin" as const;
  }
  return requestedRole ?? "user";
}

function sanitizeUser(user: { id: string; email: string; role: UserRole; createdAt: string }) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function sanitizeKnowledge(item: {
  id: string;
  authorAgentId: string;
  title: string;
  content: string;
  tokenCost: number;
  rewardCredit: number;
  rewardKnowledge: number;
  approvalStatus: KnowledgeApprovalStatus;
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
  const owner = author ? db.users.find((user) => user.id === author.ownerUserId) : null;
  const reviewer = item.reviewedByUserId ? db.users.find((user) => user.id === item.reviewedByUserId) : null;

  return {
    ...item,
    authorName: author?.name ?? "unknown",
    ownerEmail: owner?.email ?? "unknown",
    reviewerEmail: reviewer?.email ?? null
  };
}

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get("/users", (_req, res) => {
  const users = db.users.map((user) => sanitizeUser(user));
  return sendSuccess(res, { users });
});

adminRoutes.post("/users", (req, res) => {
  const payload = createUserSchema.parse(req.body);
  const normalizedEmail = payload.email.toLowerCase();

  const existing = db.users.find((user) => user.email === normalizedEmail);
  if (existing) {
    throw new AppError("Email already registered.", {
      code: ERROR_CODES.USER_ALREADY_EXISTS,
      status: 409
    });
  }

  const user = {
    id: uuidv4(),
    email: normalizedEmail,
    passwordHash: hashPassword(payload.password),
    role: resolveRole(normalizedEmail, payload.role),
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  saveDb();

  return sendSuccess(
    res,
    {
      user: sanitizeUser(user)
    },
    201
  );
});

adminRoutes.patch("/users/:id", (req, res) => {
  const payload = updateUserSchema.parse(req.body ?? {});
  const user = db.users.find((item) => item.id === req.params.id);

  if (!user) {
    throw new AppError("User not found.", {
      code: ERROR_CODES.USER_NOT_FOUND,
      status: 404
    });
  }

  if (payload.email) {
    const normalizedEmail = payload.email.toLowerCase();
    const duplicate = db.users.find((item) => item.email === normalizedEmail && item.id !== user.id);
    if (duplicate) {
      throw new AppError("Email already registered.", {
        code: ERROR_CODES.USER_ALREADY_EXISTS,
        status: 409
      });
    }
    user.email = normalizedEmail;
  }

  if (payload.password) {
    user.passwordHash = hashPassword(payload.password);
  }

  if (payload.role || payload.email) {
    user.role = resolveRole(user.email, payload.role ?? user.role);
  }
  saveDb();

  return sendSuccess(res, {
    user: sanitizeUser(user)
  });
});

adminRoutes.delete("/users/:id", (req, res) => {
  const user = db.users.find((item) => item.id === req.params.id);

  if (!user) {
    throw new AppError("User not found.", {
      code: ERROR_CODES.USER_NOT_FOUND,
      status: 404
    });
  }

  if (req.auth!.userId === user.id) {
    throw new AppError("Admin cannot delete self.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  const userAgentIds = db.agents.filter((agent) => agent.ownerUserId === user.id).map((agent) => agent.id);
  const userWalletAddresses = db.wallets
    .filter((wallet) => wallet.ownerAgentId && userAgentIds.includes(wallet.ownerAgentId))
    .map((wallet) => wallet.address);

  db.users = db.users.filter((item) => item.id !== user.id);
  db.apiKeys = db.apiKeys.filter((item) => item.userId !== user.id);
  db.agents = db.agents.filter((agent) => agent.ownerUserId !== user.id);
  db.intents = db.intents.filter(
    (intent) =>
      !userAgentIds.includes(intent.borrowerId) &&
      !(intent.requestedLenderId && userAgentIds.includes(intent.requestedLenderId)) &&
      !(intent.matchedLenderId && userAgentIds.includes(intent.matchedLenderId))
  );
  db.loans = db.loans.filter(
    (loan) => !userAgentIds.includes(loan.borrowerId) && !userAgentIds.includes(loan.lenderId)
  );
  db.wallets = db.wallets.filter(
    (wallet) => wallet.ownerAgentId === null || !userAgentIds.includes(wallet.ownerAgentId)
  );
  db.walletTransactions = db.walletTransactions.filter(
    (tx) => !userWalletAddresses.includes(tx.fromAddress) && !userWalletAddresses.includes(tx.toAddress)
  );
  db.creditTokenTransactions = db.creditTokenTransactions.filter(
    (tx) => !userWalletAddresses.includes(tx.fromAddress) && !userWalletAddresses.includes(tx.toAddress)
  );
  saveDb();

  return sendSuccess(res, {
    deletedUserId: user.id
  });
});

adminRoutes.get("/agents", (_req, res) => {
  const agents = db.agents.map((agent) => {
    const owner = db.users.find((user) => user.id === agent.ownerUserId);
    return {
      ...agent,
      ownerEmail: owner?.email ?? "unknown"
    };
  });

  return sendSuccess(res, { agents });
});

adminRoutes.patch("/agents/:id", (req, res) => {
  const payload = updateAgentSchema.parse(req.body);
  const agent = db.agents.find((item) => item.id === req.params.id);

  if (!agent) {
    throw new AppError("Agent not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  if (typeof payload.isDisabled === "boolean") {
    agent.isDisabled = payload.isDisabled;
    agent.disabledAt = payload.isDisabled ? new Date().toISOString() : null;
  }

  if (payload.name) {
    agent.name = payload.name.trim();
  }

  agent.updatedAt = new Date().toISOString();
  saveDb();

  return sendSuccess(res, {
    agent
  });
});

adminRoutes.get("/knowledge", (_req, res) => {
  const knowledge = db.knowledgePoints
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => sanitizeKnowledge(item));

  return sendSuccess(res, { knowledge });
});

adminRoutes.patch("/knowledge/:id/review", (req, res) => {
  const payload = reviewKnowledgeSchema.parse(req.body ?? {});
  const knowledge = db.knowledgePoints.find((item) => item.id === req.params.id);

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

  const note = payload.note?.trim();
  knowledge.approvalStatus = payload.status;
  knowledge.reviewNote = note && note.length > 0 ? note : null;
  knowledge.reviewedAt = new Date().toISOString();
  knowledge.reviewedByUserId = req.auth!.userId;
  knowledge.updatedAt = new Date().toISOString();
  saveDb();

  return sendSuccess(res, {
    knowledge: sanitizeKnowledge(knowledge)
  });
});

adminRoutes.patch("/knowledge/:id/offline", (req, res) => {
  const knowledge = db.knowledgePoints.find((item) => item.id === req.params.id);

  if (!knowledge) {
    throw new AppError("Knowledge point not found.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 404
    });
  }

  if (!knowledge.isCancelled) {
    const now = new Date().toISOString();
    knowledge.isCancelled = true;
    knowledge.cancelledAt = now;
    knowledge.cancelledByUserId = req.auth!.userId;
    knowledge.updatedAt = now;
    saveDb();
  }

  return sendSuccess(res, {
    knowledge: sanitizeKnowledge(knowledge)
  });
});

adminRoutes.post("/system/prune", asyncHandler(async (req, res) => {
  const payload = pruneSystemSchema.parse(req.body ?? {});
  const preserveUserEmails = payload.preserveUserEmails ?? [...ADMIN_EMAILS];

  pruneDomainData({ preserveUserEmails });
  await ensureTreasuryWallet();

  return sendSuccess(res, {
    pruned: true,
    preservedUsers: db.users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role
    }))
  });
}));
