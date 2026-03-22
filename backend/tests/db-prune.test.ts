import test from "node:test";
import assert from "node:assert/strict";
import { db, pruneDomainData } from "../src/store/db";

function resetDb() {
  db.users = [];
  db.apiKeys = [];
  db.agents = [];
  db.agentClaims = [];
  db.intents = [];
  db.loans = [];
  db.wallets = [];
  db.walletTransactions = [];
  db.creditTokenTransactions = [];
  db.knowledgePoints = [];
  db.knowledgeLearnings = [];
  db.autonomyPolicies = [];
  db.autonomyTickReports = [];
  db.runtimeMode = {
    autoEnabled: true,
    updatedAt: new Date().toISOString()
  };
}

test("pruneDomainData keeps preserved login credentials only", () => {
  resetDb();

  const preserved = {
    id: "user-preserved",
    email: "admin@example.com",
    passwordHash: "hash-preserved",
    role: "admin" as const,
    createdAt: new Date().toISOString()
  };

  db.users.push(
    preserved,
    {
      id: "user-drop",
      email: "other@acs.dev",
      passwordHash: "hash-drop",
      role: "user",
      createdAt: new Date().toISOString()
    }
  );

  db.apiKeys.push({
    id: "k1",
    userId: preserved.id,
    name: "legacy-key",
    key: "secret",
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  });

  db.agents.push({
    id: "agent-1",
    ownerUserId: preserved.id,
    name: "Agent Keep?",
    walletAddress: "wdk_agent",
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
  });

  pruneDomainData({
    preserveUserEmails: ["admin@example.com"]
  });

  assert.equal(db.users.length, 1);
  assert.equal(db.users[0].email, preserved.email);
  assert.equal(db.users[0].role, preserved.role);
  assert.equal(db.users[0].passwordHash, preserved.passwordHash);

  assert.equal(db.apiKeys.length, 0);
  assert.equal(db.agents.length, 0);
  assert.equal(db.intents.length, 0);
  assert.equal(db.loans.length, 0);
  assert.equal(db.wallets.length, 0);
  assert.equal(db.runtimeMode.autoEnabled, false);
});
