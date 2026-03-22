import { v4 as uuidv4 } from "uuid";
import { db, saveDb } from "../store/db";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import { wdkAdapter } from "./wdk-adapter";

function makeVerificationCode() {
  const chunk = Math.random().toString(36).slice(2, 6).toUpperCase();
  return "reef-" + chunk;
}

function makeAgentToken() {
  return "acs_agent_" + uuidv4().replaceAll("-", "");
}

export function registerAgentClaim(params: { name: string; description: string }) {
  const claim = {
    id: uuidv4(),
    agentName: params.name,
    description: params.description,
    agentToken: makeAgentToken(),
    verificationCode: makeVerificationCode(),
    status: "pending_claim" as const,
    createdAt: new Date().toISOString(),
    claimedAt: null,
    claimedByUserId: null,
    claimedAgentId: null
  };

  db.agentClaims.push(claim);
  saveDb();

  return {
    claim,
    claimUrl: `http://localhost:3000/auth?agentToken=${claim.agentToken}`
  };
}

export function getAgentClaimStatus(agentToken: string) {
  const claim = db.agentClaims.find((item) => item.agentToken === agentToken);
  if (!claim) {
    throw new AppError("Agent claim record not found.", {
      code: ERROR_CODES.AGENT_CLAIM_NOT_FOUND,
      status: 404
    });
  }

  return {
    status: claim.status,
    agentName: claim.agentName,
    claimedByUserId: claim.claimedByUserId,
    claimedAt: claim.claimedAt
  };
}

export async function claimAgent(params: {
  agentToken: string;
  verificationCode: string;
  userId: string;
}) {
  const claim = db.agentClaims.find((item) => item.agentToken === params.agentToken);

  if (!claim) {
    throw new AppError("Agent claim record not found.", {
      code: ERROR_CODES.AGENT_CLAIM_NOT_FOUND,
      status: 404
    });
  }

  if (claim.verificationCode !== params.verificationCode) {
    throw new AppError("Invalid verification code.", {
      code: ERROR_CODES.INVALID_CLAIM_CODE,
      status: 400
    });
  }

  if (claim.status === "claimed" && claim.claimedByUserId !== params.userId) {
    throw new AppError("This agent has already been claimed.", {
      code: ERROR_CODES.AGENT_ALREADY_CLAIMED,
      status: 409
    });
  }

  if (claim.status !== "claimed") {
    claim.status = "claimed";
    claim.claimedByUserId = params.userId;
    claim.claimedAt = new Date().toISOString();
  }

  const agent = await ensureClaimedAgent(claim, params.userId);
  saveDb();

  return { claim, agent };
}

async function ensureClaimedAgent(
  claim: {
    id: string;
    agentName: string;
    description: string;
    claimedAgentId: string | null;
  },
  ownerUserId: string
) {
  if (claim.claimedAgentId) {
    const existingById = db.agents.find((item) => item.id === claim.claimedAgentId);
    if (existingById) {
      return existingById;
    }
  }

  const existingByName = db.agents.find((item) => item.ownerUserId === ownerUserId && item.name === claim.agentName);
  if (existingByName) {
    claim.claimedAgentId = existingByName.id;
    return existingByName;
  }

  const wallet = await wdkAdapter.createWallet(claim.id);
  const now = new Date().toISOString();

  const agent = {
    id: claim.id,
    ownerUserId,
    name: claim.agentName,
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
  claim.claimedAgentId = agent.id;

  return agent;
}

export async function ensureAllClaimsHaveAgent(ownerUserId: string) {
  let patched = 0;
  for (const claim of db.agentClaims) {
    if (claim.status === "claimed" && claim.claimedByUserId === ownerUserId) {
      const existing = db.agents.find((item) => item.id === claim.claimedAgentId);
      if (!existing) {
        await ensureClaimedAgent(claim, ownerUserId);
        patched += 1;
      }
    }
  }

  if (patched > 0) {
    saveDb();
  }

  return patched;
}
