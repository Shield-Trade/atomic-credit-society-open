import { v4 as uuidv4 } from "uuid";
import { db, saveDb } from "../store/db";
import type { Agent, AutonomyTickReport } from "../types/domain";
import { applyCreditUpdate } from "./credit-engine";
import { executeMatchedIntent } from "./loan-execution-service";
import { calculateLoanAmountDue, repayLoan } from "./loan-repayment-service";
import { evaluateBorrowAutonomyPolicy, getAutonomyPolicy } from "./policy-engine";
import { solveIntent } from "./solver-engine";

function scopeAgents(ownerUserId: string | null, agentId: string | null): Agent[] {
  return db.agents.filter((agent) => {
    if (agent.isDisabled) {
      return false;
    }
    if (ownerUserId && agent.ownerUserId !== ownerUserId) {
      return false;
    }
    if (agentId && agent.id !== agentId) {
      return false;
    }
    return true;
  });
}

function persistAutonomyReport(report: AutonomyTickReport) {
  db.autonomyTickReports.push({
    id: uuidv4(),
    report
  });
  if (db.autonomyTickReports.length > 500) {
    db.autonomyTickReports.splice(0, db.autonomyTickReports.length - 500);
  }
}

function monitorLoanLifecycle(report: AutonomyTickReport, scopedAgentIds: Set<string>) {
  const now = Date.now();
  const dueSoonWindowMs = 24 * 60 * 60 * 1000;

  for (const loan of db.loans) {
    if (loan.status !== "active") {
      continue;
    }

    if (!scopedAgentIds.has(loan.borrowerId)) {
      continue;
    }

    const dueAtMs = new Date(loan.dueAt).getTime();
    const borrower = db.agents.find((item) => item.id === loan.borrowerId);
    if (!borrower) {
      continue;
    }

    if (dueAtMs <= now) {
      loan.status = "defaulted";
      borrower.defaultEvents += 1;
      applyCreditUpdate(borrower);
      report.actions.push({
        type: "loan_defaulted",
        agentId: borrower.id,
        message: `Loan ${loan.id} is overdue and marked defaulted.`,
        refId: loan.id
      });
      continue;
    }

    if (dueAtMs - now <= dueSoonWindowMs) {
      report.actions.push({
        type: "loan_repayment_due",
        agentId: borrower.id,
        message: `Loan ${loan.id} due at ${loan.dueAt}.`,
        refId: loan.id
      });
    }
  }
}

function monitorPendingIntents(report: AutonomyTickReport, scopedAgentIds: Set<string>) {
  const now = Date.now();

  for (const intent of db.intents) {
    if (!scopedAgentIds.has(intent.borrowerId)) {
      continue;
    }

    if (intent.status === "matched") {
      const hasExecutedLoan = db.loans.some((loan) => loan.intentId === intent.id);
      if (!hasExecutedLoan) {
        report.actions.push({
          type: "loan_ready_for_approval",
          agentId: intent.borrowerId,
          message: `Intent ${intent.id} matched. Human approval is required to execute loan.`,
          refId: intent.id
        });
      }
      continue;
    }

    if (intent.status === "open" || intent.status === "solving") {
      const ageMs = now - new Date(intent.timestamp).getTime();
      if (ageMs >= 60 * 60 * 1000) {
        report.actions.push({
          type: "intent_waiting_match",
          agentId: intent.borrowerId,
          message: `Intent ${intent.id} still pending (${intent.status}).`,
          refId: intent.id
        });
      }
    }
  }
}

async function processOpenIntents(report: AutonomyTickReport, scopedAgentIds: Set<string>) {
  for (const intent of db.intents) {
    if (intent.status !== "open") {
      continue;
    }

    if (!scopedAgentIds.has(intent.borrowerId)) {
      continue;
    }

    try {
      const solved = await solveIntent({
        intentId: intent.id,
        solverAgentId: null
      });

      if (
        solved.decision.approved &&
        solved.decision.lenderId &&
        typeof solved.decision.offeredInterest === "number"
      ) {
        report.actions.push({
          type: "borrow_intent_matched",
          agentId: intent.borrowerId,
          message: `Intent ${intent.id} matched with lender ${solved.decision.lenderId}.`,
          refId: intent.id
        });

        const borrower = db.agents.find((item) => item.id === intent.borrowerId);
        if (!borrower) {
          report.actions.push({
            type: "loan_execute_failed",
            agentId: intent.borrowerId,
            message: `Intent ${intent.id} matched but borrower record is missing.`,
            refId: intent.id
          });
          continue;
        }

        const policy = evaluateBorrowAutonomyPolicy({
          userId: borrower.ownerUserId,
          amount: intent.amount,
          offeredInterest: solved.decision.offeredInterest,
          riskProfile: intent.riskProfile
        });

        if (!policy.allowed) {
          intent.status = "rejected";
          intent.matchedLenderId = null;
          intent.solverReason = `Policy blocked: ${policy.reason}`;
          intent.solverEvaluatedAt = new Date().toISOString();
          report.actions.push({
            type: "policy_blocked",
            agentId: borrower.id,
            message: `Intent ${intent.id} blocked by policy: ${policy.reason}`,
            refId: intent.id
          });
          continue;
        }

        try {
          const executed = await executeMatchedIntent({
            intentId: intent.id,
            initiatedBy: "system",
            requireBorrowerOwnerUserId: borrower.ownerUserId
          });

          report.actions.push({
            type: "loan_executed",
            agentId: borrower.id,
            message: executed.reused
              ? `Intent ${intent.id} already executed previously.`
              : `Loan ${executed.loan.id} executed from matched intent ${intent.id}.`,
            refId: executed.loan.id
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "unknown execution error";
          report.actions.push({
            type: "loan_execute_failed",
            agentId: borrower.id,
            message: `Intent ${intent.id} execution failed: ${reason}`,
            refId: intent.id
          });
        }
        continue;
      }

      report.actions.push({
        type: "borrow_skipped",
        agentId: intent.borrowerId,
        message: `Intent ${intent.id} rejected by solver: ${solved.decision.reason}`,
        refId: intent.id
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown solver error";
      report.actions.push({
        type: "borrow_skipped",
        agentId: intent.borrowerId,
        message: `Intent ${intent.id} solve failed: ${reason}`,
        refId: intent.id
      });
    }
  }
}

async function processAutoRepay(report: AutonomyTickReport, scopedAgentIds: Set<string>) {
  const now = Date.now();
  const dueSoonWindowMs = 24 * 60 * 60 * 1000;

  for (const loan of db.loans) {
    if (loan.status !== "active" || !scopedAgentIds.has(loan.borrowerId)) {
      continue;
    }

    const borrower = db.agents.find((item) => item.id === loan.borrowerId);
    if (!borrower) {
      continue;
    }

    const autoRepayAtMs = loan.autoRepayAt ? new Date(loan.autoRepayAt).getTime() : null;
    if (autoRepayAtMs) {
      if (autoRepayAtMs > now) {
        continue;
      }
    } else {
      const dueAtMs = new Date(loan.dueAt).getTime();
      if (dueAtMs - now > dueSoonWindowMs) {
        continue;
      }
    }

    const policy = getAutonomyPolicy(borrower.ownerUserId);
    if (!policy.autoRepayEnabled) {
      continue;
    }

    const outstanding = Number((calculateLoanAmountDue(loan.amount, loan.interestRate) - loan.totalRepaid).toFixed(2));
    if (outstanding <= 0) {
      continue;
    }

    try {
      const repaid = await repayLoan({
        loanId: loan.id,
        amount: outstanding,
        initiatedBy: "system",
        requireBorrowerOwnerUserId: borrower.ownerUserId
      });

      report.actions.push({
        type: "loan_repaid",
        agentId: borrower.id,
        message:
          repaid.loan.status === "repaid"
            ? `Loan ${loan.id} auto-repaid successfully.`
            : `Loan ${loan.id} auto-repay partial success, outstanding ${repaid.outstanding}.`,
        refId: loan.id
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown repay error";
      report.actions.push({
        type: "loan_repay_failed",
        agentId: borrower.id,
        message: `Loan ${loan.id} auto-repay failed: ${reason}`,
        refId: loan.id
      });
    }
  }
}

export async function runAutonomyTick(options?: {
  ownerUserId?: string;
  agentId?: string | null;
}): Promise<AutonomyTickReport> {
  const report: AutonomyTickReport = {
    processedAt: new Date().toISOString(),
    ownerUserId: options?.ownerUserId ?? null,
    actions: []
  };

  const scopedAgents = scopeAgents(report.ownerUserId, options?.agentId ?? null);
  const scopedAgentIds = new Set(scopedAgents.map((agent) => agent.id));

  await processOpenIntents(report, scopedAgentIds);
  await processAutoRepay(report, scopedAgentIds);
  monitorLoanLifecycle(report, scopedAgentIds);
  monitorPendingIntents(report, scopedAgentIds);
  persistAutonomyReport(report);
  saveDb();
  return report;
}
