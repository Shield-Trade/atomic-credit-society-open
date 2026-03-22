export type UserRole = "user" | "admin";
export type RiskProfile = "low" | "medium" | "high";
export type LoanStatus = "pending" | "active" | "repaid" | "defaulted";
export type SettlementAsset = "USDT" | "USAT" | "XAUT" | "BTC";
export type KnowledgeApprovalStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RepaymentEvent {
  loanId: string;
  amount: number;
  onTime: boolean;
  timestamp: string;
}

export interface IncomeEvent {
  amount: number;
  source: "teaching" | "system_reward" | "other";
  timestamp: string;
}

export interface Agent {
  id: string;
  ownerUserId: string;
  name: string;
  walletAddress: string;
  reputationScore: number;
  knowledgeScore: number;
  teachingScore: number;
  creditScore: number;
  incomeHistory: IncomeEvent[];
  repaymentHistory: RepaymentEvent[];
  defaultEvents: number;
  isDisabled: boolean;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BorrowIntent {
  id: string;
  borrowerId: string;
  source?: "borrow_request" | "lend_request";
  requestedLenderId?: string | null;
  autoRepayAfterMinutes?: number | null;
  amount: number;
  asset: SettlementAsset;
  durationDays: number;
  maxInterest: number;
  riskProfile: RiskProfile;
  recommendedInterest: number | null;
  timestamp: string;
  matchedLenderId: string | null;
  solverAgentId: string | null;
  solverReason: string | null;
  solverEvaluatedAt: string | null;
  humanApprovedAt: string | null;
  status: "open" | "solving" | "matched" | "rejected" | "expired";
}

export interface Loan {
  id: string;
  borrowerId: string;
  lenderId: string;
  intentId: string;
  amount: number;
  interestRate: number;
  durationDays: number;
  status: LoanStatus;
  asset: SettlementAsset;
  createdAt: string;
  dueAt: string;
  autoRepayAt?: string | null;
  repaidAt: string | null;
  totalRepaid: number;
}

export interface Wallet {
  address: string;
  ownerAgentId: string | null;
  // Legacy balance field kept for backward compatibility with existing UI/tests.
  balance: number;
  creditTokenBalance: number;
  balances: Record<SettlementAsset, number>;
  accounts: WalletAccount[];
  policy: WalletPolicy;
  provider?: "mock" | "wdk-evm";
  wdk?: {
    chain: "evm";
    seedPhrase: string;
    accountIndex: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchDecision {
  approved: boolean;
  reason: string;
  lenderId?: string;
  borrowerId?: string;
  offeredInterest?: number;
}

export interface AgentClaim {
  id: string;
  agentName: string;
  description: string;
  agentToken: string;
  verificationCode: string;
  status: "pending_claim" | "claimed";
  createdAt: string;
  claimedAt: string | null;
  claimedByUserId: string | null;
  claimedAgentId: string | null;
}

export interface WalletPolicy {
  maxTransferPerTx: number;
  allowedAssets: SettlementAsset[];
}

export interface WalletAccount {
  id: string;
  walletAddress: string;
  asset: SettlementAsset;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  fromAddress: string;
  toAddress: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  asset: SettlementAsset;
  signature: string;
  onChainTxHash: string;
  initiatedBy: "agent" | "system";
  timestamp: string;
}

export interface CreditTokenTransaction {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  reason: string;
  timestamp: string;
}

export interface KnowledgePoint {
  id: string;
  authorAgentId: string;
  title: string;
  content: string;
  tokenCost: number;
  rewardCredit: number;
  rewardKnowledge: number;
  approvalStatus: KnowledgeApprovalStatus;
  isCancelled: boolean;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeLearning {
  id: string;
  knowledgeId: string;
  learnerAgentId: string;
  providerAgentId: string;
  tokenPaid: number;
  txId: string;
  createdAt: string;
}

export interface AutonomyPolicy {
  userId: string;
  autoBorrowEnabled: boolean;
  autoRepayEnabled: boolean;
  borrowMaxAmount: number;
  borrowMaxInterest: number;
  allowedRiskProfiles: RiskProfile[];
  updatedAt: string;
}

export interface AutonomyAction {
  type:
    | "borrow_intent_created"
    | "borrow_intent_matched"
    | "loan_executed"
    | "loan_execute_failed"
    | "loan_repaid"
    | "loan_defaulted"
    | "loan_repay_failed"
    | "borrow_skipped"
    | "loan_repayment_due"
    | "loan_ready_for_approval"
    | "policy_blocked"
    | "intent_waiting_match"
    | "demo_knowledge_published"
    | "demo_knowledge_learned"
    | "demo_token_earned"
    | "demo_intent_rejected"
    | "demo_intent_matched"
    | "demo_loan_settled";
  agentId: string;
  message: string;
  refId?: string;
}

export interface AutonomyTickReport {
  processedAt: string;
  ownerUserId: string | null;
  actions: AutonomyAction[];
}

export interface AutonomyTickRecord {
  id: string;
  report: AutonomyTickReport;
}
