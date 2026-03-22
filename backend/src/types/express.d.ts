import type { Request } from "express";
import type { UserRole } from "./domain";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        role: UserRole;
        provider: "jwt" | "api_key" | "agent_token";
        apiKeyId?: string;
        agentToken?: string;
        claimedAgentId?: string | null;
      };
    }
  }
}

export type AuthenticatedRequest = Request & {
  auth: {
    userId: string;
    email: string;
    role: UserRole;
    provider: "jwt" | "api_key" | "agent_token";
    apiKeyId?: string;
    agentToken?: string;
    claimedAgentId?: string | null;
  };
};
