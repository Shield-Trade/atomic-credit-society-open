"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, WalletIcon } from "@heroicons/react/24/outline";
import { apiClient } from "@/lib/api-client";
import { DashboardShell } from "@/components/DashboardShell";

interface Agent {
  id: string;
  name: string;
  walletAddress: string;
}

interface WalletBalanceRow {
  walletAddress: string;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  balance: number;
}

interface WalletCreditRow {
  walletAddress: string;
  creditTokenBalance: number;
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

const EXPLORER_TX_BASE = process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL ?? "https://sepolia.etherscan.io/tx/";

function shortId(id: string) {
  return id.slice(0, 8) + "...";
}

function fmtDate(value: string) {
  return new Date(value).toLocaleString();
}

function explorerTxUrl(hash: string) {
  if (!hash || !hash.startsWith("0x")) {
    return "";
  }
  return EXPLORER_TX_BASE + hash;
}

export default function WalletPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [balances, setBalances] = useState<Record<string, WalletBalanceRow>>({});
  const [creditBalances, setCreditBalances] = useState<Record<string, WalletCreditRow>>({});
  const [historyByWallet, setHistoryByWallet] = useState<Record<string, WalletTx[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  const totalUsdt = useMemo(() => Object.values(balances).reduce((sum, row) => sum + row.balance, 0), [balances]);
  const totalCreditToken = useMemo(
    () => Object.values(creditBalances).reduce((sum, row) => sum + row.creditTokenBalance, 0),
    [creditBalances]
  );
  const totalTxCount = useMemo(
    () => Object.values(historyByWallet).reduce((sum, rows) => sum + rows.length, 0),
    [historyByWallet]
  );

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const agentData = await apiClient.get<{ agents: Agent[] }>("/agent/");
      setAgents(agentData.agents);

      const balanceRows = await Promise.all(
        agentData.agents.map(async (agent) => {
          const result = await apiClient.get<WalletBalanceRow>(
            `/wallet/balance?walletAddress=${encodeURIComponent(agent.walletAddress)}&asset=USDT`
          );
          return [agent.walletAddress, result] as const;
        })
      );

      const creditRows = await Promise.all(
        agentData.agents.map(async (agent) => {
          const result = await apiClient.get<WalletCreditRow>(
            `/wallet/credit-balance?walletAddress=${encodeURIComponent(agent.walletAddress)}`
          );
          return [agent.walletAddress, result] as const;
        })
      );

      const historyRows = await Promise.all(
        agentData.agents.map(async (agent) => {
          const history = await apiClient.get<{ walletAddress: string; transactions: WalletTx[] }>(
            `/wallet/history?walletAddress=${encodeURIComponent(agent.walletAddress)}&limit=20`
          );
          return [agent.walletAddress, history.transactions] as const;
        })
      );

      setBalances(Object.fromEntries(balanceRows));
      setCreditBalances(Object.fromEntries(creditRows));
      setHistoryByWallet(Object.fromEntries(historyRows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tokenMissing) {
      refresh();
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
      section="wallet"
      title="Operator Wallet Overview"
      subtitle="All agents under this operator and each wallet's balance and recent transactions."
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
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Agents</p>
          <p className="mt-2 text-3xl font-bold text-white">{agents.length}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Total USDT</p>
          <p className="mt-2 text-3xl font-bold text-white">{totalUsdt.toFixed(2)}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Total Credit Token</p>
          <p className="mt-2 text-3xl font-bold text-white">{totalCreditToken.toFixed(2)}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Recent Tx Rows</p>
          <p className="mt-2 text-3xl font-bold text-white">{totalTxCount}</p>
        </article>
      </div>

      <div className="space-y-5">
        {agents.length === 0 ? (
          <article className="surface-card p-6 text-sm text-slate-100">
            No agents found under this operator. Claim an agent first in Dashboard.
          </article>
        ) : null}

        {agents.map((agent) => {
          const balance = balances[agent.walletAddress];
          const creditBalance = creditBalances[agent.walletAddress];
          const txs = historyByWallet[agent.walletAddress] || [];

          return (
            <article key={agent.id} className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/10 p-2">
                    <WalletIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">{agent.name}</h2>
                    <p className="text-xs text-muted">agent {shortId(agent.id)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">Wallet</p>
                  <p className="mt-2 break-all text-sm text-slate-100">{agent.walletAddress}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">Balance</p>
                  {balance ? (
                    <p className="mt-2 text-xl font-semibold text-white">
                      {balance.asset} {balance.balance.toFixed(2)}
                    </p>
                  ) : (
                    <p className="mt-2">Balance not available.</p>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">Credit Token</p>
                  {creditBalance ? (
                    <p className="mt-2 text-xl font-semibold text-white">{creditBalance.creditTokenBalance.toFixed(2)}</p>
                  ) : (
                    <p className="mt-2">Credit token not available.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
                <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-muted">Recent Transactions</h3>
                <table className="w-full min-w-[720px] text-left text-xs text-slate-100">
                  <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
                    <tr>
                      <th className="pb-2">Tx</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">From</th>
                      <th className="pb-2">To</th>
                      <th className="pb-2">Explorer</th>
                      <th className="pb-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.length === 0 ? (
                      <tr>
                        <td className="py-2" colSpan={6}>
                          No transactions.
                        </td>
                      </tr>
                    ) : null}
                    {txs.slice(0, 8).map((tx) => {
                      const explorerUrl = explorerTxUrl(tx.onChainTxHash);
                      return (
                        <tr key={tx.id} className="border-t border-white/10">
                          <td className="py-2">{shortId(tx.id)}</td>
                          <td className="py-2">
                            {tx.asset} {tx.amount}
                          </td>
                          <td className="py-2">{shortId(tx.fromAddress)}</td>
                          <td className="py-2">{shortId(tx.toAddress)}</td>
                          <td className="py-2">
                            {explorerUrl ? (
                              <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                                View Tx
                              </a>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="py-2">{fmtDate(tx.timestamp)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </DashboardShell>
  );
}
