import { v4 as uuidv4 } from "uuid";
import { ERROR_CODES } from "../constants/error-codes";
import { db, saveDb } from "../store/db";
import { AppError } from "../utils/app-error";
import { wdkAdapter } from "./wdk-adapter";

function computeOfferedInterest(maxInterest: number, borrowerCreditScore: number) {
  return Number(Math.max(1, maxInterest - borrowerCreditScore / 40).toFixed(2));
}

export async function executeMatchedIntent(params: {
  intentId: string;
  initiatedBy?: "agent" | "system";
  requireBorrowerOwnerUserId?: string | null;
  requireLenderOwnerUserId?: string | null;
}) {
  const intent = db.intents.find((item) => item.id === params.intentId);

  if (!intent) {
    throw new AppError("Intent not found.", {
      code: ERROR_CODES.INTENT_NOT_FOUND,
      status: 404
    });
  }

  if (!intent.matchedLenderId) {
    throw new AppError("Intent must be matched before execution.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  if (intent.status !== "matched") {
    throw new AppError("Only matched intent can be executed.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  const existingLoan = db.loans.find((item) => item.intentId === intent.id);
  if (existingLoan) {
    return {
      loan: existingLoan,
      settlement: null,
      reused: true as const
    };
  }

  const borrower = db.agents.find((item) => item.id === intent.borrowerId);
  const lender = db.agents.find((item) => item.id === intent.matchedLenderId);

  if (!borrower || !lender) {
    throw new AppError("Borrower or lender not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  if (params.requireBorrowerOwnerUserId && borrower.ownerUserId !== params.requireBorrowerOwnerUserId) {
    throw new AppError("Cannot execute another user's loan.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  if (params.requireLenderOwnerUserId && lender.ownerUserId !== params.requireLenderOwnerUserId) {
    throw new AppError("Cannot execute another user's loan.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  if (borrower.isDisabled || lender.isDisabled) {
    throw new AppError("Disabled agent cannot execute loan.", {
      code: ERROR_CODES.AGENT_DISABLED,
      status: 403
    });
  }

  const offeredInterest =
    typeof intent.recommendedInterest === "number"
      ? intent.recommendedInterest
      : computeOfferedInterest(intent.maxInterest, borrower.creditScore);

  const tx = await wdkAdapter.sendTransaction({
    fromAddress: lender.walletAddress,
    toAddress: borrower.walletAddress,
    amount: intent.amount,
    asset: intent.asset,
    initiatedBy: params.initiatedBy ?? "agent"
  });

  const createdAt = new Date();
  const dueAt = new Date(createdAt.getTime() + intent.durationDays * 24 * 60 * 60 * 1000);
  const autoRepayAfterMinutes =
    typeof intent.autoRepayAfterMinutes === "number" && intent.autoRepayAfterMinutes > 0
      ? intent.autoRepayAfterMinutes
      : null;
  const autoRepayAt = autoRepayAfterMinutes
    ? new Date(createdAt.getTime() + autoRepayAfterMinutes * 60 * 1000).toISOString()
    : null;

  const loan = {
    id: uuidv4(),
    borrowerId: borrower.id,
    lenderId: lender.id,
    intentId: intent.id,
    amount: intent.amount,
    interestRate: offeredInterest,
    durationDays: intent.durationDays,
    status: "active" as const,
    asset: intent.asset,
    createdAt: createdAt.toISOString(),
    dueAt: dueAt.toISOString(),
    autoRepayAt,
    repaidAt: null,
    totalRepaid: 0
  };

  db.loans.push(loan);
  intent.humanApprovedAt = new Date().toISOString();
  saveDb();

  return {
    loan,
    settlement: tx,
    reused: false as const
  };
}
