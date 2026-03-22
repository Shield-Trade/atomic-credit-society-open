import type { AutonomyPolicy, RiskProfile } from "../types/domain";
import { db, saveDb } from "../store/db";

type AutonomyPolicyInput = {
  autoBorrowEnabled?: boolean;
  autoRepayEnabled?: boolean;
  borrowMaxAmount?: number;
  borrowMaxInterest?: number;
  allowedRiskProfiles?: RiskProfile[];
};

const DEFAULT_ALLOWED_RISKS: RiskProfile[] = ["low", "medium", "high"];

function buildDefaultPolicy(userId: string): AutonomyPolicy {
  return {
    userId,
    autoBorrowEnabled: false,
    autoRepayEnabled: true,
    borrowMaxAmount: 100,
    borrowMaxInterest: 12,
    allowedRiskProfiles: [...DEFAULT_ALLOWED_RISKS],
    updatedAt: new Date().toISOString()
  };
}

function normalizeAllowedRiskProfiles(input: RiskProfile[] | undefined): RiskProfile[] {
  if (!input || input.length === 0) {
    return [...DEFAULT_ALLOWED_RISKS];
  }

  const unique = Array.from(new Set(input));
  if (unique.length === 0) {
    return [...DEFAULT_ALLOWED_RISKS];
  }

  return unique;
}

export function getAutonomyPolicy(userId: string): AutonomyPolicy {
  const found = db.autonomyPolicies.find((item) => item.userId === userId);
  if (found) {
    return found;
  }

  const created = buildDefaultPolicy(userId);
  db.autonomyPolicies.push(created);
  saveDb();
  return created;
}

export function upsertAutonomyPolicy(userId: string, input: AutonomyPolicyInput): AutonomyPolicy {
  const existing = db.autonomyPolicies.find((item) => item.userId === userId);
  const now = new Date().toISOString();

  if (!existing) {
    const created = buildDefaultPolicy(userId);
    if (typeof input.autoBorrowEnabled === "boolean") {
      created.autoBorrowEnabled = input.autoBorrowEnabled;
    }
    if (typeof input.autoRepayEnabled === "boolean") {
      created.autoRepayEnabled = input.autoRepayEnabled;
    }
    if (typeof input.borrowMaxAmount === "number") {
      created.borrowMaxAmount = input.borrowMaxAmount;
    }
    if (typeof input.borrowMaxInterest === "number") {
      created.borrowMaxInterest = input.borrowMaxInterest;
    }
    created.allowedRiskProfiles = normalizeAllowedRiskProfiles(input.allowedRiskProfiles);
    created.updatedAt = now;
    db.autonomyPolicies.push(created);
    saveDb();
    return created;
  }

  if (typeof input.autoBorrowEnabled === "boolean") {
    existing.autoBorrowEnabled = input.autoBorrowEnabled;
  }
  if (typeof input.autoRepayEnabled === "boolean") {
    existing.autoRepayEnabled = input.autoRepayEnabled;
  }
  if (typeof input.borrowMaxAmount === "number") {
    existing.borrowMaxAmount = input.borrowMaxAmount;
  }
  if (typeof input.borrowMaxInterest === "number") {
    existing.borrowMaxInterest = input.borrowMaxInterest;
  }
  if (input.allowedRiskProfiles) {
    existing.allowedRiskProfiles = normalizeAllowedRiskProfiles(input.allowedRiskProfiles);
  }
  existing.updatedAt = now;
  saveDb();
  return existing;
}

export function evaluateBorrowAutonomyPolicy(input: {
  userId: string;
  amount: number;
  offeredInterest: number;
  riskProfile: RiskProfile;
}): { allowed: boolean; reason: string; policy: AutonomyPolicy } {
  const policy = getAutonomyPolicy(input.userId);

  if (!policy.autoBorrowEnabled) {
    return {
      allowed: false,
      reason: "Auto-borrow is disabled by user policy.",
      policy
    };
  }

  if (input.amount > policy.borrowMaxAmount) {
    return {
      allowed: false,
      reason: `Amount ${input.amount} exceeds policy max ${policy.borrowMaxAmount}.`,
      policy
    };
  }

  if (input.offeredInterest > policy.borrowMaxInterest) {
    return {
      allowed: false,
      reason: `Interest ${input.offeredInterest}% exceeds policy max ${policy.borrowMaxInterest}%.`,
      policy
    };
  }

  if (!policy.allowedRiskProfiles.includes(input.riskProfile)) {
    return {
      allowed: false,
      reason: `Risk profile ${input.riskProfile} is blocked by policy.`,
      policy
    };
  }

  return {
    allowed: true,
    reason: "Policy check passed.",
    policy
  };
}
