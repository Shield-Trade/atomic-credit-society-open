"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { apiClient } from "@/lib/api-client";
import { DashboardShell } from "@/components/DashboardShell";

interface Agent {
  id: string;
  name: string;
  walletAddress: string;
}

interface Intent {
  id: string;
  borrowerId: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  status: "open" | "solving" | "matched" | "rejected" | "expired";
  matchedLenderId: string | null;
  timestamp: string;
}

interface Loan {
  id: string;
  intentId: string;
  borrowerId: string;
  lenderId: string;
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

interface HistoryRow {
  id: string;
  asset: string;
  amount: number;
  fromAgent: string;
  toAgent: string;
  status: string;
  updatedAt: string;
  settlementTxHash: string | null;
}

const PAGE_SIZE = 10;
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

function statusClass(status: string) {
  if (status === "repaid" || status === "matched") {
    return "bg-emerald-400/15 text-emerald-200 border-emerald-300/30";
  }
  if (status === "active" || status === "solving") {
    return "bg-sky-400/15 text-sky-200 border-sky-300/30";
  }
  if (status === "defaulted" || status === "cancel") {
    return "bg-rose-400/15 text-rose-200 border-rose-300/30";
  }
  return "bg-white/10 text-slate-200 border-white/20";
}

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  const activeCount = useMemo(() => rows.filter((row) => row.status === "active").length, [rows]);
  const solvingCount = useMemo(() => rows.filter((row) => row.status === "solving").length, [rows]);
  const settledCount = useMemo(
    () => rows.filter((row) => row.status === "matched" || row.status === "repaid").length,
    [rows]
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const [agentData, intentData, loanData] = await Promise.all([
        apiClient.get<{ agents: Agent[] }>("/agent/"),
        apiClient.get<{ intents: Intent[] }>("/intent/"),
        apiClient.get<{ loans: Loan[] }>("/loan/")
      ]);

      const historyByWallet = await Promise.all(
        agentData.agents.map(async (agent) => {
          const history = await apiClient.get<{ walletAddress: string; transactions: WalletTx[] }>(
            `/wallet/history?walletAddress=${encodeURIComponent(agent.walletAddress)}&limit=100`
          );
          return history.transactions;
        })
      );
      const txRows = historyByWallet.flat();
      const walletByAgentId = new Map(agentData.agents.map((agent) => [agent.id, agent.walletAddress]));

      const nameById = new Map<string, string>();
      agentData.agents.forEach((agent) => nameById.set(agent.id, agent.name));

      const loanByIntent = new Map<string, Loan>();
      loanData.loans.forEach((loan) => loanByIntent.set(loan.intentId, loan));

      const mapped = intentData.intents
        .map((intent) => {
          const loan = loanByIntent.get(intent.id);

          let status = "pending";
          if (intent.status === "expired" || intent.status === "rejected") {
            status = "cancel";
          } else if (intent.status === "solving") {
            status = "solving";
          } else if (loan) {
            status = loan.status;
          } else if (intent.status === "matched") {
            status = "matched";
          }

          const fromAgent = loan
            ? nameById.get(loan.lenderId) || shortId(loan.lenderId)
            : intent.matchedLenderId
              ? nameById.get(intent.matchedLenderId) || shortId(intent.matchedLenderId)
              : "-";

          const toAgent = nameById.get(intent.borrowerId) || shortId(intent.borrowerId);

          const lenderWallet = loan ? walletByAgentId.get(loan.lenderId) : null;
          const borrowerWallet = walletByAgentId.get(intent.borrowerId);
          const settlementTx = loan
            ? txRows.find((tx) => {
                if (!lenderWallet) {
                  return false;
                }
                const near = Math.abs(+new Date(tx.timestamp) - +new Date(loan.createdAt)) <= 20 * 60 * 1000;
                if (!near || tx.fromAddress !== lenderWallet || tx.asset !== intent.asset) {
                  return false;
                }
                if (Math.abs(tx.amount - intent.amount) >= 0.000001) {
                  return false;
                }
                if (!borrowerWallet) {
                  return true;
                }
                return tx.toAddress === borrowerWallet;
              })
            : null;

          return {
            id: intent.id,
            asset: intent.asset,
            amount: intent.amount,
            fromAgent,
            toAgent,
            status,
            updatedAt: loan?.createdAt || intent.timestamp,
            settlementTxHash: settlementTx?.onChainTxHash ?? null
          } satisfies HistoryRow;
        })
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));

      setRows(mapped);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history page.");
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
      section="history"
      title="Transaction History"
      subtitle="Current and completed transactions: from agent, to agent, and status."
      actions={
        <button className="btn-secondary" type="button" onClick={refresh} disabled={loading}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          Refresh
        </button>
      }
    >
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
        <article className="surface-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Total Rows</p>
          <p className="mt-2 text-3xl font-bold text-white">{rows.length}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Active Loans</p>
          <p className="mt-2 text-3xl font-bold text-white">{activeCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Solver Queue</p>
          <p className="mt-2 text-3xl font-bold text-white">{solvingCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Settled</p>
          <p className="mt-2 text-3xl font-bold text-white">{settledCount}</p>
        </article>
      </div>

      <article className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Transaction Timeline</h2>
          <p className="text-xs text-muted">
            {rows.length} rows | page {page}/{totalPages}
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs text-slate-100">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="pb-3">Intent</th>
                <th className="pb-3">Asset / Amount</th>
                <th className="pb-3">From Agent</th>
                <th className="pb-3">To Agent</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Explorer</th>
                <th className="pb-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td className="py-3" colSpan={7}>
                    No transactions found.
                  </td>
                </tr>
              ) : null}
              {pagedRows.map((row) => {
                const explorerUrl = explorerTxUrl(row.settlementTxHash);
                return (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="py-3">{shortId(row.id)}</td>
                    <td className="py-3">
                      {row.asset} {row.amount}
                    </td>
                    <td className="py-3">{row.fromAgent}</td>
                    <td className="py-3">{row.toAgent}</td>
                    <td className="py-3">
                      <span className={"rounded-full border px-2 py-1 " + statusClass(row.status)}>{row.status}</span>
                    </td>
                    <td className="py-3">
                      {explorerUrl ? (
                        <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                          View Tx
                        </a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="py-3">{fmtDate(row.updatedAt)}</td>
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
