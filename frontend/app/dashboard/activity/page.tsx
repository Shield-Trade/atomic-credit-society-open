"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { apiClient } from "@/lib/api-client";
import { DashboardShell } from "@/components/DashboardShell";

interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  creditScore: number;
  knowledgeScore: number;
  teachingScore: number;
  defaultEvents: number;
}

interface Intent {
  id: string;
  borrowerId: string;
  source?: "borrow_request" | "lend_request";
  requestedLenderId?: string | null;
  autoRepayAfterMinutes?: number | null;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  riskProfile: "low" | "medium" | "high";
  matchedLenderId: string | null;
  solverReason: string | null;
  solverEvaluatedAt: string | null;
  status: "open" | "solving" | "matched" | "rejected" | "expired";
  timestamp: string;
}

interface Loan {
  id: string;
  intentId: string;
  borrowerId: string;
  lenderId: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  status: "active" | "repaid" | "defaulted";
  createdAt: string;
}

interface WalletTx {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  onChainTxHash: string;
  timestamp: string;
}

interface AutonomyAction {
  type: string;
  agentId: string;
  message: string;
}

interface AutonomyTickRecord {
  id: string;
  report: {
    processedAt: string;
    ownerUserId: string | null;
    actions: AutonomyAction[];
  };
}

interface ActivityRow {
  id: string;
  stage: "intent" | "solve" | "settle" | "autonomy";
  timestamp: string;
  summary: string;
  detail: string;
  txHash: string | null;
}

const PAGE_SIZE = 12;
const EXPLORER_TX_BASE = process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL ?? "https://sepolia.etherscan.io/tx/";

function fmtDate(value: string) {
  return new Date(value).toLocaleString();
}

function shortId(id: string) {
  return id.slice(0, 8) + "...";
}

function explorerTxUrl(hash: string | null) {
  if (!hash || !hash.startsWith("0x")) {
    return "";
  }
  return EXPLORER_TX_BASE + hash;
}

function rateComponents(agent: Agent) {
  const baseRate = 5;

  let riskPremium = 0;
  if (agent.creditScore >= 80) {
    riskPremium = 1;
  } else if (agent.creditScore >= 70) {
    riskPremium = 2;
  } else if (agent.creditScore >= 60) {
    riskPremium = 4;
  } else if (agent.creditScore >= 50) {
    riskPremium = 6;
  } else {
    return null;
  }

  const learningDiscount = Math.min(agent.knowledgeScore / 100, 2);
  const teachingDiscount = Math.min(agent.teachingScore / 200, 1.5);
  const defaultPenalty = agent.defaultEvents >= 2 ? 6 : agent.defaultEvents === 1 ? 3 : 0;
  const rate = Number((baseRate + riskPremium - learningDiscount - teachingDiscount + defaultPenalty).toFixed(2));

  return {
    baseRate,
    riskPremium,
    learningDiscount,
    teachingDiscount,
    defaultPenalty,
    rate
  };
}

function stageClass(stage: ActivityRow["stage"]) {
  if (stage === "intent") {
    return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
  }
  if (stage === "solve") {
    return "border-violet-300/30 bg-violet-400/10 text-violet-100";
  }
  if (stage === "settle") {
    return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  }
  return "border-amber-300/30 bg-amber-400/10 text-amber-100";
}

export default function ActivityPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const [agentData, intentData, loanData, tickData] = await Promise.all([
        apiClient.get<{ agents: Agent[] }>("/agent/"),
        apiClient.get<{ intents: Intent[] }>("/intent/"),
        apiClient.get<{ loans: Loan[] }>("/loan/"),
        apiClient.get<{ reports: AutonomyTickRecord[] }>("/agent/autonomy/history?limit=50")
      ]);

      const historyByWallet = await Promise.all(
        agentData.agents.map(async (agent) => {
          const history = await apiClient.get<{ walletAddress: string; transactions: WalletTx[] }>(
            `/wallet/history?walletAddress=${encodeURIComponent(agent.walletAddress)}&limit=80`
          );
          return history.transactions;
        })
      );

      const txRows = historyByWallet.flat();
      const agentNameById = new Map(agentData.agents.map((agent) => [agent.id, agent.name]));
      const agentById = new Map(agentData.agents.map((agent) => [agent.id, agent]));
      const activityRows: ActivityRow[] = [];

      for (const intent of intentData.intents) {
        const borrower = agentNameById.get(intent.borrowerId) ?? shortId(intent.borrowerId);
        const requestedLender = intent.requestedLenderId
          ? agentNameById.get(intent.requestedLenderId) ?? shortId(intent.requestedLenderId)
          : null;
        const isLendRequest = (intent.source ?? "borrow_request") === "lend_request";
        activityRows.push({
          id: "intent-" + intent.id,
          stage: "intent",
          timestamp: intent.timestamp,
          summary: isLendRequest
            ? `Lend Intent Created | ${requestedLender ?? "-"}`
            : `Borrow Intent Created | ${borrower}`,
          detail: isLendRequest
            ? `${intent.asset} ${intent.amount} | risk ${intent.riskProfile} | auto repay ${intent.autoRepayAfterMinutes ?? 0}m`
            : `${intent.asset} ${intent.amount} | status ${intent.status}`,
          txHash: null
        });

        if (intent.solverEvaluatedAt) {
          const lender = intent.matchedLenderId
            ? agentNameById.get(intent.matchedLenderId) ?? shortId(intent.matchedLenderId)
            : "-";
          const borrowerAgent = agentById.get(intent.borrowerId);
          const rate = borrowerAgent ? rateComponents(borrowerAgent) : null;
          const rateDetail = rate
            ? ` | rate=${rate.rate}% (5 + ${rate.riskPremium} - ${rate.learningDiscount.toFixed(2)} - ${rate.teachingDiscount.toFixed(2)} + ${rate.defaultPenalty})`
            : "";
          activityRows.push({
            id: "solve-" + intent.id,
            stage: "solve",
            timestamp: intent.solverEvaluatedAt,
            summary: isLendRequest
              ? `Solver Decision | lender ${requestedLender ?? "-"}`
              : `Solver Decision | ${borrower}`,
            detail: isLendRequest
              ? `borrower ${borrower} | lender ${lender} | ${intent.solverReason ?? "no reason"}${rateDetail}`
              : `lender ${lender} | ${intent.solverReason ?? "no reason"}${rateDetail}`,
            txHash: null
          });
        }
      }

      for (const loan of loanData.loans) {
        const lender = agentNameById.get(loan.lenderId) ?? shortId(loan.lenderId);
        const borrower = agentNameById.get(loan.borrowerId) ?? shortId(loan.borrowerId);
        const lenderWallet = agentData.agents.find((agent) => agent.id === loan.lenderId)?.walletAddress;
        const borrowerWallet = agentData.agents.find((agent) => agent.id === loan.borrowerId)?.walletAddress;
        const loanTs = +new Date(loan.createdAt);
        const tx = txRows.find((item) => {
          if (!lenderWallet) {
            return false;
          }
          const txTs = +new Date(item.timestamp);
          const near = Math.abs(txTs - loanTs) <= 20 * 60 * 1000;
          if (!near || item.fromAddress !== lenderWallet || item.asset !== loan.asset) {
            return false;
          }
          if (Math.abs(item.amount - loan.amount) >= 0.000001) {
            return false;
          }
          if (!borrowerWallet) {
            return true;
          }
          return item.toAddress === borrowerWallet;
        });

        activityRows.push({
          id: "settle-" + loan.id,
          stage: "settle",
          timestamp: loan.createdAt,
          summary: `Settlement | ${lender} -> ${borrower}`,
          detail: `${loan.asset} ${loan.amount} | loan ${loan.status}`,
          txHash: tx?.onChainTxHash ?? null
        });
      }

      for (const tick of tickData.reports) {
        for (const action of tick.report.actions) {
          const agent = agentNameById.get(action.agentId) ?? shortId(action.agentId);
          const linkedWallet = agentData.agents.find((item) => item.id === action.agentId)?.walletAddress ?? null;
          const matchedTx = linkedWallet
            ? txRows.find(
                (tx) =>
                  tx.onChainTxHash.startsWith("0x") &&
                  (tx.fromAddress === linkedWallet || tx.toAddress === linkedWallet) &&
                  Math.abs(+new Date(tx.timestamp) - +new Date(tick.report.processedAt)) <= 30 * 60 * 1000
              )
            : null;

          activityRows.push({
            id: "autonomy-" + tick.id + "-" + action.type + "-" + action.agentId,
            stage: "autonomy",
            timestamp: tick.report.processedAt,
            summary: `Autonomy Action | ${agent}`,
            detail: `${action.type}: ${action.message}`,
            txHash: matchedTx?.onChainTxHash ?? null
          });
        }
      }

      setRows(activityRows.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)));
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tokenMissing) {
      refresh();
    }
  }, [tokenMissing]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (tokenMissing) {
    return (
      <section className="surface-card p-6 text-sm text-slate-100">
        Token not found. Please login at <a href="/auth" className="text-primary underline">/auth</a> first.
      </section>
    );
  }

  return (
    <DashboardShell
      section="activity"
      title="Activity Timeline"
      subtitle="Unified intent, solve, settlement, and autonomy action history."
      actions={
        <button className="btn-secondary" type="button" onClick={refresh} disabled={loading}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          Refresh
        </button>
      }
    >
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <article className="surface-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Lifecycle Records</h2>
          <p className="text-xs text-muted">
            {rows.length} rows | page {page}/{totalPages}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs text-slate-100">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="pb-3">Time</th>
                <th className="pb-3">Stage</th>
                <th className="pb-3">Summary</th>
                <th className="pb-3">Detail</th>
                <th className="pb-3">Explorer</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td className="py-3" colSpan={5}>
                    No activity records found.
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((row) => {
                const url = explorerTxUrl(row.txHash);
                return (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="py-3">{fmtDate(row.timestamp)}</td>
                    <td className="py-3">
                      <span className={"rounded-full border px-2 py-1 text-[11px] uppercase " + stageClass(row.stage)}>{row.stage}</span>
                    </td>
                    <td className="py-3">{row.summary}</td>
                    <td className="py-3">{row.detail}</td>
                    <td className="py-3">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
                          View Tx
                        </a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 text-xs">
          <button className="btn-secondary px-3 py-1.5" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Prev
          </button>
          <span className="text-slate-200">
            Page {page} / {totalPages}
          </span>
          <button className="btn-secondary px-3 py-1.5" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
            Next
          </button>
        </div>
      </article>
    </DashboardShell>
  );
}
