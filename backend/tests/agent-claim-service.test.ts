import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/store/db";
import { claimAgent, getAgentClaimStatus, registerAgentClaim } from "../src/services/agent-claim-service";
import { AppError } from "../src/utils/app-error";
import { ERROR_CODES } from "../src/constants/error-codes";

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
    autoEnabled: false,
    updatedAt: new Date().toISOString()
  };
}

test("agent claim flow: register -> pending status -> claim -> claimed status", async () => {
  resetDb();

  const registration = registerAgentClaim({
    name: "ClaimBot",
    description: "Handles claim onboarding"
  });

  assert.equal(db.agentClaims.length, 1);
  assert.match(registration.claim.agentToken, /^acs_agent_/);

  const pending = getAgentClaimStatus(registration.claim.agentToken);
  assert.equal(pending.status, "pending_claim");

  await claimAgent({
    agentToken: registration.claim.agentToken,
    verificationCode: registration.claim.verificationCode,
    userId: "user-123"
  });

  const claimed = getAgentClaimStatus(registration.claim.agentToken);
  assert.equal(claimed.status, "claimed");
  assert.equal(claimed.claimedByUserId, "user-123");

  const createdAgent = db.agents.find((item) => item.id === registration.claim.id);
  assert.ok(createdAgent);
  assert.equal(createdAgent.creditScore, 50);
  assert.equal(createdAgent.knowledgeScore, 50);
  assert.equal(createdAgent.teachingScore, 50);
  const createdWallet = db.wallets.find((wallet) => wallet.address === createdAgent.walletAddress);
  assert.ok(createdWallet);
  assert.equal(createdWallet.creditTokenBalance, 50);
});

test("agent claim rejects wrong verification code", async () => {
  resetDb();

  const registration = registerAgentClaim({
    name: "ClaimBot2",
    description: "Reject invalid verification"
  });

  await assert.rejects(
    async () =>
      await claimAgent({
        agentToken: registration.claim.agentToken,
        verificationCode: "reef-WRONG",
        userId: "user-abc"
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, ERROR_CODES.INVALID_CLAIM_CODE);
      return true;
    }
  );
});
