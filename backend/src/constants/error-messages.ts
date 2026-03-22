import { ERROR_CODES, type ErrorCode } from "./error-codes";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.UNAUTHORIZED]: "Authentication required.",
  [ERROR_CODES.INVALID_TOKEN]: "The provided token is invalid or expired.",
  [ERROR_CODES.INVALID_CREDENTIALS]: "Email or password is incorrect.",
  [ERROR_CODES.ADMIN_REQUIRED]: "Administrator access is required for this action.",
  [ERROR_CODES.USER_ALREADY_EXISTS]: "A user with this email already exists.",
  [ERROR_CODES.USER_NOT_FOUND]: "The specified user does not exist.",
  [ERROR_CODES.AGENT_NOT_FOUND]: "The specified agent does not exist.",
  [ERROR_CODES.AGENT_CLAIM_NOT_FOUND]: "The specified claim record does not exist.",
  [ERROR_CODES.AGENT_ALREADY_CLAIMED]: "This agent has already been claimed.",
  [ERROR_CODES.AGENT_DISABLED]: "The agent is currently disabled and cannot operate.",
  [ERROR_CODES.INVALID_CLAIM_CODE]: "The provided verification code is invalid.",
  [ERROR_CODES.WALLET_NOT_FOUND]: "The specified wallet does not exist.",
  [ERROR_CODES.ASSET_NOT_SUPPORTED]: "The requested settlement asset is not supported.",
  [ERROR_CODES.POLICY_VIOLATION]: "The transfer request violates wallet policy constraints.",
  [ERROR_CODES.INTENT_NOT_FOUND]: "The specified borrow intent does not exist.",
  [ERROR_CODES.LOAN_NOT_FOUND]: "The specified loan does not exist.",
  [ERROR_CODES.VALIDATION_ERROR]: "Input validation failed.",
  [ERROR_CODES.FORBIDDEN]: "You are not allowed to access this resource.",
  [ERROR_CODES.INSUFFICIENT_BALANCE]: "Insufficient wallet balance for this transfer.",
  [ERROR_CODES.MATCH_NOT_FOUND]: "No suitable lender match was found.",
  [ERROR_CODES.BAD_REQUEST]: "The request payload is invalid.",
  [ERROR_CODES.KNOWLEDGE_NOT_APPROVED]: "This knowledge point is not approved for public learning yet.",
  [ERROR_CODES.INTERNAL_ERROR]: "An unexpected server error occurred."
};
