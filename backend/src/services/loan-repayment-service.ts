import { ERROR_CODES } from "../constants/error-codes";
import { db, saveDb } from "../store/db";
import { AppError } from "../utils/app-error";
import { applyCreditUpdate } from "./credit-engine";
import { wdkAdapter } from "./wdk-adapter";

export function calculateLoanAmountDue(amount: number, interestRate: number) {
  return Number((amount * (1 + interestRate / 100)).toFixed(2));
}

export async function repayLoan(params: {
  loanId: string;
  amount?: number;
  initiatedBy?: "agent" | "system";
  requireBorrowerOwnerUserId?: string | null;
  requireBorrowerAgentId?: string | null;
}) {
  const loan = db.loans.find((item) => item.id === params.loanId);

  if (!loan) {
    throw new AppError("Loan not found.", {
      code: ERROR_CODES.LOAN_NOT_FOUND,
      status: 404
    });
  }

  if (loan.status !== "active") {
    throw new AppError("Only active loans can be repaid.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  const borrower = db.agents.find((item) => item.id === loan.borrowerId);
  const lender = db.agents.find((item) => item.id === loan.lenderId);

  if (!borrower || !lender) {
    throw new AppError("Borrower or lender not found.", {
      code: ERROR_CODES.AGENT_NOT_FOUND,
      status: 404
    });
  }

  if (params.requireBorrowerOwnerUserId && borrower.ownerUserId !== params.requireBorrowerOwnerUserId) {
    throw new AppError("Cannot repay another user's loan.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  if (params.requireBorrowerAgentId && borrower.id !== params.requireBorrowerAgentId) {
    throw new AppError("Agent token cannot repay other agents' loans.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  if (borrower.isDisabled || lender.isDisabled) {
    throw new AppError("Disabled agent cannot repay loan.", {
      code: ERROR_CODES.AGENT_DISABLED,
      status: 403
    });
  }

  const totalDue = calculateLoanAmountDue(loan.amount, loan.interestRate);
  const outstanding = Number((totalDue - loan.totalRepaid).toFixed(2));

  if (outstanding <= 0) {
    throw new AppError("Loan already repaid.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  const repayAmount = params.amount ? Number(params.amount.toFixed(2)) : outstanding;
  if (repayAmount > outstanding) {
    throw new AppError("Repay amount exceeds outstanding balance.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  const settlement = await wdkAdapter.sendTransaction({
    fromAddress: borrower.walletAddress,
    toAddress: lender.walletAddress,
    amount: repayAmount,
    asset: loan.asset,
    initiatedBy: params.initiatedBy ?? "agent"
  });

  loan.totalRepaid = Number((loan.totalRepaid + repayAmount).toFixed(2));
  if (loan.totalRepaid >= totalDue) {
    loan.status = "repaid";
    loan.repaidAt = new Date().toISOString();

    borrower.repaymentHistory.push({
      loanId: loan.id,
      amount: totalDue,
      onTime: new Date().getTime() <= new Date(loan.dueAt).getTime(),
      timestamp: new Date().toISOString()
    });
    applyCreditUpdate(borrower);
  }
  saveDb();

  return {
    loan,
    settlement,
    outstanding: Number((totalDue - loan.totalRepaid).toFixed(2))
  };
}
