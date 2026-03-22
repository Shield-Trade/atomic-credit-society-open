import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/jwt";
import { sendError } from "../utils/response";
import { ERROR_CODES } from "../constants/error-codes";
import { db, saveDb } from "../store/db";

function inspectAgentToken(token: string) {
  if (!token.startsWith("acs_agent_")) {
    return null;
  }

  const claim = db.agentClaims.find((item) => item.agentToken === token);
  if (!claim) {
    return {
      kind: "not_found" as const
    };
  }

  if (claim.status !== "claimed") {
    return {
      kind: "pending_claim" as const
    };
  }

  return {
    kind: "claimed" as const
  };
}

function resolveByAgentToken(token: string) {
  if (!token.startsWith("acs_agent_")) {
    return null;
  }

  const claim = db.agentClaims.find((item) => item.agentToken === token);
  if (!claim || claim.status !== "claimed" || !claim.claimedByUserId) {
    return null;
  }

  const user = db.users.find((item) => item.id === claim.claimedByUserId);
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    provider: "agent_token" as const,
    agentToken: token,
    claimedAgentId: claim.claimedAgentId
  };
}

function resolveByApiKey(token: string) {
  if (!token.startsWith("acs_") || token.startsWith("acs_agent_")) {
    return null;
  }

  const apiKey = db.apiKeys.find((item) => item.key === token);
  if (!apiKey) {
    return null;
  }

  const user = db.users.find((item) => item.id === apiKey.userId);
  if (!user) {
    return null;
  }

  apiKey.lastUsedAt = new Date().toISOString();
  saveDb();

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    provider: "api_key" as const,
    apiKeyId: apiKey.id
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = verifyToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      provider: "jwt"
    };
    return next();
  } catch {
    const byAgentToken = resolveByAgentToken(token);
    if (byAgentToken) {
      req.auth = byAgentToken;
      return next();
    }

    const byApiKey = resolveByApiKey(token);
    if (byApiKey) {
      req.auth = byApiKey;
      return next();
    }

    const agentTokenState = inspectAgentToken(token);
    if (agentTokenState?.kind === "pending_claim") {
      return sendError(
        res,
        ERROR_CODES.INVALID_TOKEN,
        401,
        "Agent token is not expired. It is pending claim. Complete POST /api/agent/claim with human JWT first."
      );
    }

    if (agentTokenState?.kind === "not_found") {
      return sendError(
        res,
        ERROR_CODES.INVALID_TOKEN,
        401,
        "Agent token not found in claim records. Register agent again or verify token copy/paste."
      );
    }

    return sendError(res, ERROR_CODES.INVALID_TOKEN, 401);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
  }

  if (req.auth.role !== "admin") {
    return sendError(res, ERROR_CODES.ADMIN_REQUIRED, 403);
  }

  return next();
}
