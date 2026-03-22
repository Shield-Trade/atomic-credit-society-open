export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "Session expired. Please log in again.",
  UNAUTHORIZED: "Please log in first.",
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  ADMIN_REQUIRED: "This action requires admin permissions.",
  USER_ALREADY_EXISTS: "This email is already registered.",
  AGENT_NOT_FOUND: "Agent not found.",
  AGENT_DISABLED: "This agent is disabled and cannot operate.",
  WALLET_NOT_FOUND: "Wallet not found.",
  POLICY_VIOLATION: "Transfer blocked by wallet policy limits.",
  ASSET_NOT_SUPPORTED: "Selected asset is not supported.",
  MATCH_NOT_FOUND: "No lender match available for current risk/credit profile.",
  INSUFFICIENT_BALANCE: "Wallet balance is insufficient for this action.",
  KNOWLEDGE_NOT_APPROVED: "Knowledge is pending admin approval and is not yet available.",
  INTERNAL_ERROR: "Unexpected server error. Please retry."
};
