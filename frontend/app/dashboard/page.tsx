"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeftIcon,
  ArrowPathIcon,
  ArrowUpRightIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  CheckCircleIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LightBulbIcon,
  RocketLaunchIcon
} from "@heroicons/react/24/outline";
import { apiClient } from "@/lib/api-client";
import { DashboardShell } from "@/components/DashboardShell";

interface IncomeEvent {
  amount: number;
  source: "teaching" | "system_reward" | "other";
  timestamp: string;
}

interface RepaymentEvent {
  loanId: string;
  amount: number;
  onTime: boolean;
  timestamp: string;
}

interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  isDisabled: boolean;
  creditScore: number;
  knowledgeScore: number;
  teachingScore: number;
  incomeHistory: IncomeEvent[];
  repaymentHistory: RepaymentEvent[];
}

interface Intent {
  id: string;
  borrowerId: string;
  source?: "borrow_request" | "lend_request";
  requestedLenderId?: string | null;
  autoRepayAfterMinutes?: number | null;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  durationDays: number;
  maxInterest: number;
  riskProfile: "low" | "medium" | "high";
  status: "open" | "solving" | "matched" | "rejected" | "expired";
  matchedLenderId: string | null;
  solverAgentId: string | null;
  solverReason: string | null;
  solverEvaluatedAt: string | null;
  timestamp: string;
}

interface Loan {
  id: string;
  borrowerId: string;
  lenderId: string;
  intentId: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  interestRate: number;
  durationDays: number;
  status: "active" | "repaid" | "defaulted";
  dueAt: string;
  totalRepaid: number;
  createdAt: string;
  repaidAt: string | null;
}

interface WalletBalanceSnapshot {
  walletAddress: string;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  balance: number;
  ownerName: string;
}

interface WalletCreditSnapshot {
  walletAddress: string;
  creditTokenBalance: number;
  ownerName: string;
}

interface WalletTransactionItem {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  onChainTxHash: string;
  timestamp: string;
}

interface KnowledgeItem {
  id: string;
  authorAgentId: string;
  authorName: string;
  title: string;
  content: string;
  tokenCost: number;
  rewardCredit: number;
  rewardKnowledge: number;
  learnedByOwnedAgent?: boolean;
  createdAt: string;
}

interface AutonomyAction {
  type: string;
  agentId: string;
  message: string;
  refId?: string;
}

interface AutonomyTickRecord {
  id: string;
  report: {
    processedAt: string;
    ownerUserId: string | null;
    actions: AutonomyAction[];
  };
}

interface LoanFlowRow {
  id: string;
  direction: "lend" | "borrow";
  ownerAgentName: string;
  counterpartyName: string;
  amount: number;
  asset: Loan["asset"];
  status: Loan["status"];
  createdAt: string;
}

function shortId(id: string) {
  return id.slice(0, 8) + "...";
}

function fmtDate(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function calculateTotalDue(loan: Loan) {
  return Number((loan.amount * (1 + loan.interestRate / 100)).toFixed(2));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

const EXPLORER_TX_BASE = process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL ?? "https://sepolia.etherscan.io/tx/";

function explorerTxUrl(hash: string) {
  if (!hash || !hash.startsWith("0x")) {
    return "";
  }
  return EXPLORER_TX_BASE + hash;
}

function autonomyVisual(type: string) {
  if (type.includes("defaulted")) {
    return {
      itemClass: "border-l-2 border-rose-300/50 bg-rose-400/10",
      badgeClass: "bg-rose-500/20 text-rose-200",
      Icon: ExclamationTriangleIcon
    };
  }

  if (type.includes("repaid")) {
    return {
      itemClass: "border-l-2 border-emerald-300/50 bg-emerald-400/10",
      badgeClass: "bg-emerald-500/20 text-emerald-200",
      Icon: CheckCircleIcon
    };
  }

  if (type.includes("loan_executed") || type.includes("token_earned")) {
    return {
      itemClass: "border-l-2 border-amber-300/50 bg-amber-400/10",
      badgeClass: "bg-amber-500/20 text-amber-200",
      Icon: BanknotesIcon
    };
  }

  if (type.includes("borrow_intent")) {
    return {
      itemClass: "border-l-2 border-cyan-300/50 bg-cyan-400/10",
      badgeClass: "bg-cyan-500/20 text-cyan-200",
      Icon: ArrowsRightLeftIcon
    };
  }

  if (type.includes("knowledge")) {
    return {
      itemClass: "border-l-2 border-violet-300/50 bg-violet-400/10",
      badgeClass: "bg-violet-500/20 text-violet-200",
      Icon: LightBulbIcon
    };
  }

  return {
    itemClass: "border-l-2 border-slate-300/40 bg-white/5",
    badgeClass: "bg-slate-500/20 text-slate-200",
    Icon: InformationCircleIcon
  };
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [walletSnapshots, setWalletSnapshots] = useState<WalletBalanceSnapshot[]>([]);
  const [walletCreditSnapshots, setWalletCreditSnapshots] = useState<WalletCreditSnapshot[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionItem[]>([]);
  const [autonomyActions, setAutonomyActions] = useState<AutonomyAction[]>([]);
  const [autonomyReports, setAutonomyReports] = useState<AutonomyTickRecord[]>([]);
  const [autoModeEnabled, setAutoModeEnabled] = useState(true);
  const [autoModeUpdatedAt, setAutoModeUpdatedAt] = useState<string | null>(null);
  const [ownKnowledgeItems, setOwnKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [poolKnowledgeItems, setPoolKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [claimAgentToken, setClaimAgentToken] = useState("");
  const [claimVerificationCode, setClaimVerificationCode] = useState("");
  const [claimStatus, setClaimStatus] = useState("");

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    agents.forEach((agent) => map.set(agent.id, agent.name));
    return map;
  }, [agents]);

  const ownedAgentIds = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents]);

  const creditRows = useMemo(
    () =>
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        creditScore: agent.creditScore,
        knowledgeScore: agent.knowledgeScore,
        teachingScore: agent.teachingScore
      })),
    [agents]
  );

  const creditValues = useMemo(() => creditRows.map((row) => clampScore(row.creditScore)), [creditRows]);

  const creditAverage = useMemo(() => {
    if (creditValues.length === 0) {
      return 0;
    }
    return Math.round(creditValues.reduce((sum, value) => sum + value, 0) / creditValues.length);
  }, [creditValues]);

  const creditPolyline = useMemo(() => {
    if (creditValues.length === 0) {
      return "";
    }
    if (creditValues.length === 1) {
      const y = 100 - creditValues[0];
      return `0,${y} 100,${y}`;
    }
    const step = 100 / (creditValues.length - 1);
    return creditValues.map((value, index) => `${(step * index).toFixed(2)},${100 - value}`).join(" ");
  }, [creditValues]);

  const borrowRows = useMemo(
    () =>
      intents
        .map((intent) => ({
          intentId: intent.id,
          borrowerName: agentNameById.get(intent.borrowerId) ?? shortId(intent.borrowerId),
          amount: intent.amount,
          asset: intent.asset,
          maxInterest: intent.maxInterest,
          durationDays: intent.durationDays
        }))
        .slice(0, 8),
    [intents, agentNameById]
  );

  const walletBalanceByAddress = useMemo(() => {
    const map = new Map<string, number>();
    walletSnapshots.forEach((item) => map.set(item.walletAddress, item.balance));
    return map;
  }, [walletSnapshots]);

  const creditTokenByAddress = useMemo(() => {
    const map = new Map<string, number>();
    walletCreditSnapshots.forEach((item) => map.set(item.walletAddress, item.creditTokenBalance));
    return map;
  }, [walletCreditSnapshots]);

  const totalUsdtBalance = useMemo(
    () => walletSnapshots.filter((item) => item.asset === "USDT").reduce((sum, item) => sum + item.balance, 0),
    [walletSnapshots]
  );

  const totalCreditTokenBalance = useMemo(
    () => walletCreditSnapshots.reduce((sum, item) => sum + item.creditTokenBalance, 0),
    [walletCreditSnapshots]
  );

  const loanFlowRows = useMemo(() => {
    const rows: LoanFlowRow[] = [];

    for (const loan of loans) {
      if (ownedAgentIds.has(loan.lenderId)) {
        rows.push({
          id: `${loan.id}-lend`,
          direction: "lend",
          ownerAgentName: agentNameById.get(loan.lenderId) ?? shortId(loan.lenderId),
          counterpartyName: agentNameById.get(loan.borrowerId) ?? shortId(loan.borrowerId),
          amount: loan.amount,
          asset: loan.asset,
          status: loan.status,
          createdAt: loan.createdAt
        });
      }

      if (ownedAgentIds.has(loan.borrowerId)) {
        rows.push({
          id: `${loan.id}-borrow`,
          direction: "borrow",
          ownerAgentName: agentNameById.get(loan.borrowerId) ?? shortId(loan.borrowerId),
          counterpartyName: agentNameById.get(loan.lenderId) ?? shortId(loan.lenderId),
          amount: loan.amount,
          asset: loan.asset,
          status: loan.status,
          createdAt: loan.createdAt
        });
      }
    }

    return rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [loans, ownedAgentIds, agentNameById]);

  const openLoansCount = useMemo(() => loans.filter((loan) => loan.status === "active").length, [loans]);
  const openIntentCount = useMemo(() => intents.filter((intent) => intent.status === "open").length, [intents]);

  const agentProfileRows = useMemo(
    () =>
      agents.map((agent) => {
        const borrowingLoans = loans
          .filter((loan) => loan.borrowerId === agent.id)
          .map((loan) => {
            const totalDue = calculateTotalDue(loan);
            return {
              loanId: loan.id,
              counterparty: agentNameById.get(loan.lenderId) ?? shortId(loan.lenderId),
              asset: loan.asset,
              amount: loan.amount,
              outstanding: Number((totalDue - loan.totalRepaid).toFixed(2)),
              dueAt: loan.dueAt,
              status: loan.status
            };
          });

        return {
          id: agent.id,
          name: agent.name,
          isDisabled: agent.isDisabled,
          creditScore: agent.creditScore,
          walletAddress: agent.walletAddress,
          walletBalance: walletBalanceByAddress.get(agent.walletAddress) ?? 0,
          creditTokenBalance: creditTokenByAddress.get(agent.walletAddress) ?? 0,
          borrowingLoans
        };
      }),
    [agents, loans, agentNameById, walletBalanceByAddress, creditTokenByAddress]
  );

  async function refreshAll() {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const [agentData, intentData, loanData] = await Promise.all([
        apiClient.get<{ agents: Agent[] }>("/agent/"),
        apiClient.get<{ intents: Intent[] }>("/intent/"),
        apiClient.get<{ loans: Loan[] }>("/loan/")
      ]);
      setAgents(agentData.agents);
      setIntents(intentData.intents);
      setLoans(loanData.loans);

      const balanceRows = await Promise.all(
        agentData.agents.map(async (agent) => {
          const result = await apiClient.get<{
            walletAddress: string;
            asset: "USDT" | "USAT" | "XAUT" | "BTC";
            balance: number;
          }>(`/wallet/balance?walletAddress=${encodeURIComponent(agent.walletAddress)}&asset=USDT`);

          return {
            ownerName: agent.name,
            walletAddress: result.walletAddress,
            asset: result.asset,
            balance: result.balance
          } satisfies WalletBalanceSnapshot;
        })
      );
      setWalletSnapshots(balanceRows);

      const creditRows = await Promise.all(
        agentData.agents.map(async (agent) => {
          const result = await apiClient.get<{
            walletAddress: string;
            creditTokenBalance: number;
          }>(`/wallet/credit-balance?walletAddress=${encodeURIComponent(agent.walletAddress)}`);

          return {
            ownerName: agent.name,
            walletAddress: result.walletAddress,
            creditTokenBalance: result.creditTokenBalance
          } satisfies WalletCreditSnapshot;
        })
      );
      setWalletCreditSnapshots(creditRows);

      if (agentData.agents.length > 0) {
        const firstWallet = agentData.agents[0].walletAddress;
        const history = await apiClient.get<{
          walletAddress: string;
          transactions: WalletTransactionItem[];
        }>(`/wallet/history?walletAddress=${encodeURIComponent(firstWallet)}&limit=20`);
        setWalletTransactions(history.transactions);
      } else {
        setWalletTransactions([]);
      }

      const [mineKnowledge, poolKnowledge] = await Promise.all([
        apiClient.get<{ items: KnowledgeItem[] }>("/knowledge/mine"),
        apiClient.get<{ items: KnowledgeItem[] }>("/knowledge/pool")
      ]);
      setOwnKnowledgeItems(mineKnowledge.items);
      setPoolKnowledgeItems(poolKnowledge.items);

      const autonomyHistory = await apiClient.get<{ reports: AutonomyTickRecord[] }>("/agent/autonomy/history?limit=20");
      setAutonomyReports(autonomyHistory.reports);
      setAutonomyActions(autonomyHistory.reports[0]?.report.actions ?? []);

      const autonomyMode = await apiClient.get<{ autoEnabled: boolean; updatedAt: string | null }>("/agent/autonomy/mode");
      setAutoModeEnabled(autonomyMode.autoEnabled);
      setAutoModeUpdatedAt(autonomyMode.updatedAt ?? null);

      setStatus("Live data refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  async function onRunAutonomyTick() {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const data = await apiClient.post<{
        report: {
          processedAt: string;
          ownerUserId: string | null;
          actions: AutonomyAction[];
        };
      }>("/agent/autonomy/tick", {});
      setAutonomyActions(data.report.actions);
      await refreshAll();
      setStatus(`Autonomy tick done. ${data.report.actions.length} actions.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run autonomy tick.");
    } finally {
      setLoading(false);
    }
  }

  async function onRunSolver() {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const openIntent = intents.find((intent) => intent.status === "open");
      const matchedWithoutLoan = intents.find(
        (intent) => intent.status === "matched" && !loans.some((loan) => loan.intentId === intent.id)
      );

      if (!openIntent && !matchedWithoutLoan) {
        setStatus("No open intents to solve.");
        return;
      }

      let targetIntentId = matchedWithoutLoan?.id ?? null;
      let autoRepayAfterMinutes: number | null = matchedWithoutLoan?.autoRepayAfterMinutes ?? null;

      if (openIntent) {
        const solved = await apiClient.post<{
          intent: Intent;
          decision: {
            approved: boolean;
            reason: string;
            lenderId?: string;
            borrowerId?: string;
            offeredInterest?: number;
          };
          autoSettlement?: {
            autoSettled: boolean;
            skippedReason: string | null;
            execution: {
              loan: {
                id: string;
                status: "active" | "repaid" | "defaulted";
              };
              settlement: {
                onChainTxHash: string;
              } | null;
            } | null;
          } | null;
        }>("/solver/solve", {
          intentId: openIntent.id
        });

        if (!solved.decision.approved) {
          await refreshAll();
          setStatus(`Solver rejected intent: ${solved.decision.reason}`);
          return;
        }

        targetIntentId = solved.intent.id;
        autoRepayAfterMinutes = solved.intent.autoRepayAfterMinutes ?? null;

        if (solved.autoSettlement?.autoSettled && solved.autoSettlement.execution?.loan) {
          await refreshAll();
          const settledTx = solved.autoSettlement.execution.settlement?.onChainTxHash ?? "";
          const settledExplorer = explorerTxUrl(settledTx);
          const settledTxText = settledExplorer ? ` Tx: ${settledExplorer}` : "";
          const settledRepayHint =
            autoRepayAfterMinutes && autoRepayAfterMinutes > 0
              ? ` Auto repay is scheduled in ${autoRepayAfterMinutes} minute(s).`
              : "";
          setStatus(
            `Run Solver completed: policy passed and auto-settlement executed loan ${solved.autoSettlement.execution.loan.id}.${settledRepayHint}${settledTxText}`
          );
          return;
        }

        if (!solved.autoSettlement?.autoSettled && solved.autoSettlement?.skippedReason) {
          await refreshAll();
          setStatus(`Solver matched intent, but auto-settlement skipped: ${solved.autoSettlement.skippedReason}`);
          return;
        }
      }

      if (!targetIntentId) {
        setStatus("No matched intent is ready for execution.");
        return;
      }

      const executed = await apiClient.post<{
        loan: {
          id: string;
          status: "active" | "repaid" | "defaulted";
        };
        settlement: {
          onChainTxHash: string;
        } | null;
      }>("/loan/execute", {
        intentId: targetIntentId
      });
      await refreshAll();

      const txHash = executed.settlement?.onChainTxHash ?? "";
      const explorer = explorerTxUrl(txHash);
      const txText = explorer ? ` Tx: ${explorer}` : "";
      let autoModeNote = "";
      if (autoRepayAfterMinutes && autoRepayAfterMinutes > 0 && !autoModeEnabled) {
        try {
          await apiClient.post<{ autoEnabled: boolean; updatedAt: string | null }>("/agent/autonomy/mode", {
            autoEnabled: true
          });
          setAutoModeEnabled(true);
          autoModeNote = " Auto mode has been enabled for scheduled repay.";
        } catch {
          autoModeNote = " Auto mode is currently OFF; scheduled repay needs Auto mode ON.";
        }
      }
      const repayHint =
        autoRepayAfterMinutes && autoRepayAfterMinutes > 0
          ? ` Auto repay is scheduled in ${autoRepayAfterMinutes} minute(s).`
          : "";
      setStatus(`Run Solver completed: matched and executed loan ${executed.loan.id}.${repayHint}${autoModeNote}${txText}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run solver.");
    } finally {
      setLoading(false);
    }
  }

  async function onBootstrapDemo() {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const data = await apiClient.post<{
        report: {
          actions: AutonomyAction[];
        } | null;
        demoSummary?: {
          tokenCost: number;
          tokenType: string;
          matchedCount?: number;
          pendingApprovalCount?: number;
        };
      }>("/agent/demo/bootstrap", {
        runAutonomy: false
      });

      if (data.report) {
        setAutonomyActions(data.report.actions);
      }

      await refreshAll();
      if (data.demoSummary) {
        setStatus(
          `Demo bootstrap completed: publish/learn executed, ${data.demoSummary.matchedCount ?? 0} intent(s) matched, ${data.demoSummary.pendingApprovalCount ?? 0} waiting for human approval. Publisher earned ${data.demoSummary.tokenCost} ${data.demoSummary.tokenType}.`
        );
      } else {
        setStatus("Demo bootstrap completed. Agents are ready for live walkthrough.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bootstrap demo.");
    } finally {
      setLoading(false);
    }
  }

  async function onSetAutoMode(enabled: boolean) {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const data = await apiClient.post<{ autoEnabled: boolean; updatedAt: string | null }>("/agent/autonomy/mode", {
        autoEnabled: enabled
      });
      setAutoModeEnabled(data.autoEnabled);
      setAutoModeUpdatedAt(data.updatedAt ?? null);
      setStatus(
        data.autoEnabled
          ? "Auto mode enabled. Monitoring and solver worker will run automatically."
          : "Manual mode enabled. Background monitoring and solver worker paused."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update mode.");
    } finally {
      setLoading(false);
    }
  }

  async function onClaimAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setClaimStatus("");
    setLoading(true);
    try {
      const data = await apiClient.post<{
        claim: {
          id: string;
          name: string;
          status: string;
          claimedAgentId: string | null;
        };
        agent: {
          id: string;
          name: string;
          walletAddress: string;
        };
      }>("/agent/claim", {
        agentToken: claimAgentToken.trim(),
        verificationCode: claimVerificationCode.trim()
      });
      setClaimStatus(
        `Agent claimed successfully: ${data.agent.name} | wallet ${shortId(data.agent.walletAddress)}`
      );
      setClaimAgentToken("");
      setClaimVerificationCode("");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim agent.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tokenMissing) {
      refreshAll();
    }
  }, [tokenMissing]);

  if (tokenMissing) {
    return (
      <section className="surface-card p-6 text-sm text-slate-100">
        Token not found. Please login at <a href="/auth" className="text-primary underline">/auth</a> first.
      </section>
    );
  }

  return (
    <DashboardShell
      section="dashboard"
      title="Agent-Driven Transaction Console"
      subtitle="Hybrid flow: agent recommendation, deterministic matching, human approval, WDK settlement, and lifecycle tracking."
      actions={
        <button className="btn-secondary" type="button" onClick={refreshAll} disabled={loading}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          Refresh
        </button>
      }
    >
      {status ? <p className="mb-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-4">
          <article className="surface-card p-6">
            <p className="text-xs uppercase tracking-[0.14em] text-amber-300">Only for demo purpose</p>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-slate-200">
                Mode:{" "}
                <span className={autoModeEnabled ? "text-emerald-200" : "text-amber-200"}>
                  {autoModeEnabled ? "Auto" : "Manual"}
                </span>
              </p>
              {autoModeUpdatedAt ? <p className="mt-1 text-[11px] text-muted">Updated: {fmtDate(autoModeUpdatedAt)}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn-secondary w-full" type="button" onClick={() => onSetAutoMode(true)} disabled={loading || autoModeEnabled}>
                  Auto ON
                </button>
                <button className="btn-secondary w-full" type="button" onClick={() => onSetAutoMode(false)} disabled={loading || !autoModeEnabled}>
                  Manual ON
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button className="btn-secondary w-full" type="button" onClick={onRunAutonomyTick} disabled={loading}>
                <CpuChipIcon className="mr-1 h-4 w-4" />
                Run Autonomy Tick
              </button>
              <button className="btn-secondary w-full" type="button" onClick={onRunSolver} disabled={loading}>
                <ArrowsRightLeftIcon className="mr-1 h-4 w-4" />
                Run Solver
              </button>
              <button className="btn-secondary w-full" type="button" onClick={onBootstrapDemo} disabled={loading}>
                <RocketLaunchIcon className="mr-1 h-4 w-4" />
                Bootstrap Demo
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Quick demo tools: auto-generate sample actions, solver decisions, and full walkthrough data.
            </p>
          </article>

          <article className="surface-card-soft relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-violet-400/10 blur-2xl" />
            <h2 className="mb-4 text-base font-semibold text-white">Claim Agent</h2>
            <p className="text-xs text-muted">Use `agentToken` and `verificationCode` from your agent.</p>
            <form className="mt-4 space-y-3" onSubmit={onClaimAgent}>
              <div>
                <label htmlFor="agentToken" className="label">
                  Agent Token
                </label>
                <input
                  id="agentToken"
                  className="input"
                  value={claimAgentToken}
                  onChange={(e) => setClaimAgentToken(e.target.value)}
                  placeholder="acs_agent_xxx"
                  required
                />
              </div>
              <div>
                <label htmlFor="verificationCode" className="label">
                  Verification Code
                </label>
                <input
                  id="verificationCode"
                  className="input"
                  value={claimVerificationCode}
                  onChange={(e) => setClaimVerificationCode(e.target.value)}
                  placeholder="reef-ABCD"
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading || !claimAgentToken || !claimVerificationCode}
              >
                Initialize Agent Identity
              </button>
            </form>
            {claimStatus ? (
              <p className="mt-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{claimStatus}</p>
            ) : null}
          </article>

          <article className="surface-card p-6">
            <h2 className="text-xs uppercase tracking-[0.14em] text-muted">Wallet Balances (USDT)</h2>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-bold text-white">{totalUsdtBalance.toFixed(2)}</p>
                <p className="text-xs text-slate-300">Available Liquidity</p>
              </div>
              <div className="flex h-12 items-end gap-1">
                {walletSnapshots.slice(0, 5).map((row, index) => {
                  const max = Math.max(totalUsdtBalance, 1);
                  const ratio = Math.max(16, Math.round((row.balance / max) * 48));
                  return <span key={row.walletAddress + index} className="w-2 rounded-t bg-primary/60" style={{ height: ratio }} />;
                })}
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs text-slate-100">
              {walletSnapshots.length === 0 ? <p>No wallet balances available.</p> : null}
              {walletSnapshots.slice(0, 6).map((row) => (
                <p key={row.walletAddress}>
                  {row.ownerName} | {row.asset} {row.balance} | credit token{" "}
                  {(creditTokenByAddress.get(row.walletAddress) ?? 0).toFixed(2)} | {shortId(row.walletAddress)}
                </p>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Total credit token: {totalCreditTokenBalance.toFixed(2)}</p>
          </article>

          <article className="surface-card p-6">
            <h2 className="text-xs uppercase tracking-[0.14em] text-muted">Autonomy Actions (Latest Tick)</h2>
            {autonomyReports[0]?.report.processedAt ? (
              <p className="mt-1 text-[11px] text-muted">Tick: {fmtDate(autonomyReports[0].report.processedAt)}</p>
            ) : null}
            <div className="mt-3 space-y-2 text-xs text-slate-100">
              {autonomyActions.length === 0 ? <p>No autonomy actions yet.</p> : null}
              {autonomyActions.slice(0, 6).map((action, index) => {
                const visual = autonomyVisual(action.type);
                const Icon = visual.Icon;

                return (
                  <div key={action.type + action.agentId + index} className={"rounded-lg border border-white/10 p-3 " + visual.itemClass}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-semibold text-slate-100">
                        <Icon className="h-4 w-4" />
                        {shortId(action.agentId)}
                      </p>
                      <span className={"rounded-full px-2 py-0.5 text-[10px] uppercase " + visual.badgeClass}>
                        {action.type.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-muted">{action.message}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">History</p>
              <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                {autonomyReports.length === 0 ? <p>No history yet.</p> : null}
                {autonomyReports.slice(0, 5).map((item) => (
                  <p key={item.id}>
                    {fmtDate(item.report.processedAt)} | actions {item.report.actions.length}
                  </p>
                ))}
              </div>
            </div>
          </article>
        </div>

        <div className="space-y-6 lg:col-span-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
            <article className="surface-card-soft md:col-span-3 p-6">
              <h2 className="text-sm uppercase tracking-[0.14em] text-muted">Credit Situation</h2>
              <div className="relative mt-4 h-48 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="absolute right-4 top-3 text-5xl font-black tracking-tight text-white/10">{creditAverage}</p>
                <svg viewBox="0 0 100 100" className="h-full w-full">
                  <polyline points={creditPolyline} fill="none" stroke="rgba(34, 211, 238, 0.95)" strokeWidth="2" />
                </svg>
                <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-muted">
                  {creditRows.slice(0, 4).map((row) => (
                    <span key={row.id} className="truncate">{row.name}</span>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-100 sm:grid-cols-2">
                {creditRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <p className="font-semibold text-white">{row.name}</p>
                    <p className="mt-1 text-muted">
                      credit {row.creditScore} | knowledge {row.knowledgeScore} | teaching {row.teachingScore}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="surface-card md:col-span-2 p-6">
              <h2 className="text-sm uppercase tracking-[0.14em] text-muted">Borrow History</h2>
              <div className="mt-4 space-y-3 text-xs text-slate-100">
                {borrowRows.length === 0 ? <p>No borrow intents found.</p> : null}
                {borrowRows.map((row) => (
                  <div key={row.intentId} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="font-semibold text-white">{row.borrowerName}</p>
                    <p className="mt-1 text-muted">
                      {row.asset} {row.amount} | max {row.maxInterest}% | {row.durationDays}d
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="surface-card p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-muted">
                <BanknotesIcon className="h-4 w-4 text-primary" />
                Loan Flow History
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-rose-200">Lend</span>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-cyan-200">Borrow</span>
              </div>
            </div>

            <div className="space-y-3">
              {loanFlowRows.length === 0 ? <p className="text-xs text-slate-100">No lend/borrow records found.</p> : null}
              {loanFlowRows.map((row) => {
                const lend = row.direction === "lend";
                return (
                  <div key={row.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <div className={lend ? "rounded-lg bg-rose-400/15 p-2 text-rose-200" : "rounded-lg bg-cyan-400/15 p-2 text-cyan-200"}>
                        {lend ? <ArrowUpRightIcon className="h-4 w-4" /> : <ArrowDownLeftIcon className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">
                          {lend ? "Lend Out" : "Borrow In"} | {row.ownerAgentName}
                        </p>
                        <p className="text-[11px] text-muted">
                          {lend ? "to" : "from"} {row.counterpartyName} | {fmtDate(row.createdAt)} | {row.status}
                        </p>
                      </div>
                    </div>
                    <p className={lend ? "text-sm font-semibold text-rose-200" : "text-sm font-semibold text-cyan-200"}>
                      {lend ? "-" : "+"}
                      {row.amount} {row.asset}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="surface-card w-full p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-white">Current Agent Profiles</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">Open Loans: {openLoansCount}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">Open Intents: {openIntentCount}</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
              <table className="w-full min-w-[900px] text-left text-xs text-slate-100">
                <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
                  <tr>
                    <th className="pb-2">Agent Entity</th>
                    <th className="pb-2">Credit Efficiency</th>
                    <th className="pb-2 text-right">USDT Balance</th>
                    <th className="pb-2 text-right">Credit Token</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agentProfileRows.length === 0 ? (
                    <tr>
                      <td className="py-3" colSpan={5}>No agents found.</td>
                    </tr>
                  ) : null}
                  {agentProfileRows.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="py-3">
                        <p className="font-semibold text-white">{row.name}</p>
                        <p className="text-[11px] text-muted">{shortId(row.id)} | {shortId(row.walletAddress)}</p>
                      </td>
                      <td className="py-3">
                        <div className="flex max-w-[180px] flex-col gap-1">
                          <span className="text-[11px] text-cyan-200">{row.creditScore}%</span>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-cyan-300/80" style={{ width: `${clampScore(row.creditScore)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right font-semibold text-white">{row.walletBalance.toFixed(2)}</td>
                      <td className="py-3 text-right font-semibold text-white">{row.creditTokenBalance.toFixed(2)}</td>
                      <td className="py-3 text-right">
                        <span
                          className={
                            "rounded-full px-2 py-1 text-[10px] uppercase " +
                            (row.isDisabled ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200")
                          }
                        >
                          {row.isDisabled ? "disabled" : "active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-2 text-xs text-slate-100">
              {agentProfileRows.map((row) =>
                row.borrowingLoans.length === 0 ? null : (
                  <div key={"loans-" + row.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="font-semibold text-white">{row.name} Borrowing</p>
                    {row.borrowingLoans.map((loan) => (
                      <p key={"borrow-" + loan.loanId} className="mt-1 text-muted">
                        {shortId(loan.loanId)} | from {loan.counterparty} | {loan.asset} {loan.amount} | outstanding {loan.outstanding} | due {fmtDate(loan.dueAt)} | {loan.status}
                      </p>
                    ))}
                  </div>
                )
              )}
            </div>
          </article>

          <article className="surface-card w-full p-6">
            <h2 className="flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-muted">
              <ArrowsRightLeftIcon className="h-4 w-4 text-primary" />
              Wallet Transaction History
            </h2>
            <div className="mt-4 space-y-2 text-xs text-slate-100">
              {walletTransactions.length === 0 ? <p>No wallet transactions found.</p> : null}
              {walletTransactions.slice(0, 10).map((tx) => {
                const explorerUrl = explorerTxUrl(tx.onChainTxHash);
                return (
                  <p key={tx.id}>
                    {shortId(tx.id)} | {tx.asset} {tx.amount} | from {shortId(tx.fromAddress)} to {shortId(tx.toAddress)} | hash{" "}
                    {explorerUrl ? (
                      <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                        {shortId(tx.onChainTxHash)}
                      </a>
                    ) : (
                      shortId(tx.onChainTxHash)
                    )}{" "}
                    | {fmtDate(tx.timestamp)}
                  </p>
                );
              })}
            </div>
          </article>

          <article className="surface-card w-full p-6">
            <h2 className="flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-muted">
              <LightBulbIcon className="h-4 w-4 text-primary" />
              Knowledge Snapshot
            </h2>
            <p className="mt-2 text-xs text-muted">Read-only monitor. Agent publication and learning are autonomous.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 text-xs text-slate-100">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="font-semibold text-white">My Agents: {ownKnowledgeItems.length}</p>
                {ownKnowledgeItems.slice(0, 3).map((item) => (
                  <p key={item.id} className="mt-2 text-muted">{item.title} | token {item.tokenCost}</p>
                ))}
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="font-semibold text-white">Pool: {poolKnowledgeItems.length}</p>
                {poolKnowledgeItems.slice(0, 3).map((item) => (
                  <p key={item.id} className="mt-2 text-muted">{item.title} | by {item.authorName}</p>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </DashboardShell>
  );
}
