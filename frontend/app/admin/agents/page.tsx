"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { apiClient } from "@/lib/api-client";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

interface AgentRecord {
  id: string;
  ownerEmail: string;
  name: string;
  walletAddress: string;
  creditScore: number;
  isDisabled: boolean;
  disabledAt: string | null;
  createdAt: string;
}

function fmtDate(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function shortId(value: string) {
  return value.slice(0, 8) + "...";
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [editAgentId, setEditAgentId] = useState("");
  const [editAgentName, setEditAgentName] = useState("");

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  const isAdmin = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return localStorage.getItem("user_role") === "admin";
  }, []);

  async function refreshAgents() {
    setLoading(true);
    setError("");
    try {
      const data = await apiClient.get<{ agents: AgentRecord[] }>("/admin/agents");
      setAgents(data.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tokenMissing && isAdmin) {
      refreshAgents();
    }
  }, [tokenMissing, isAdmin]);

  const filteredAgents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return agents;
    }

    return agents.filter((agent) => {
      const statusText = agent.isDisabled ? "disabled" : "active";
      return (
        agent.name.toLowerCase().includes(keyword) ||
        agent.ownerEmail.toLowerCase().includes(keyword) ||
        statusText.includes(keyword)
      );
    });
  }, [agents, search]);

  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageAgents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAgents.slice(start, start + pageSize);
  }, [filteredAgents, page]);

  async function onRenameAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAgentId || !editAgentName.trim()) {
      setError("Select an agent and enter a valid name.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      await apiClient.patch(`/admin/agents/${editAgentId}`, {
        name: editAgentName.trim()
      });
      await refreshAgents();
      setStatus("Agent updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent.");
    } finally {
      setLoading(false);
    }
  }

  async function onToggleAgent(agent: AgentRecord) {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      await apiClient.patch(`/admin/agents/${agent.id}`, {
        isDisabled: !agent.isDisabled
      });
      await refreshAgents();
      setStatus(agent.isDisabled ? "Agent enabled." : "Agent disabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent status.");
    } finally {
      setLoading(false);
    }
  }

  if (tokenMissing) {
    return (
      <section className="surface-card p-6 text-sm text-slate-100">
        Token not found. Please login at <a href="/auth" className="text-primary underline">/auth</a> first.
      </section>
    );
  }

  if (!isAdmin) {
    return <section className="surface-card p-6 text-sm text-slate-100">This page is for admin users only.</section>;
  }

  return (
    <DashboardShell
      section="admin-agents"
      title="Agent Management"
      subtitle="Search, modify, status control, and pagination for registered agents."
      actions={
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary">Back</Link>
          <button className="btn-secondary" type="button" onClick={refreshAgents} disabled={loading}>
            <ArrowPathIcon className="mr-1 h-4 w-4" />
            Refresh
          </button>
        </div>
      }
    >
      {status ? <p className="mb-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <article className="surface-card p-5">
        <h2 className="text-base font-semibold text-white">Modify Agent</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={onRenameAgent}>
          <select
            className="input"
            value={editAgentId}
            onChange={(e) => {
              const selected = agents.find((agent) => agent.id === e.target.value);
              setEditAgentId(e.target.value);
              setEditAgentName(selected?.name ?? "");
            }}
            required
          >
            <option value="">Select agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          <input className="input" placeholder="Agent name" value={editAgentName} onChange={(e) => setEditAgentName(e.target.value)} required />
          <button className="btn-secondary" type="submit" disabled={loading}>Rename</button>
        </form>
      </article>

      <article className="surface-card mt-5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Agents</h2>
          <input className="input w-full max-w-sm" placeholder="Search by agent/owner/status" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
          <table className="w-full min-w-[900px] text-left text-xs text-slate-100">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="pb-2">Agent</th>
                <th className="pb-2">Owner</th>
                <th className="pb-2">Wallet</th>
                <th className="pb-2">Credit</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Created</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageAgents.length === 0 ? (
                <tr>
                  <td className="py-2" colSpan={7}>No agents found.</td>
                </tr>
              ) : null}
              {pageAgents.map((agent) => (
                <tr key={agent.id} className="border-t border-white/10">
                  <td className="py-2">
                    <p className="font-semibold text-white">{agent.name}</p>
                    <p className="text-[11px] text-muted">{shortId(agent.id)}</p>
                  </td>
                  <td className="py-2">{agent.ownerEmail}</td>
                  <td className="py-2">{shortId(agent.walletAddress)}</td>
                  <td className="py-2">{agent.creditScore}</td>
                  <td className="py-2">
                    <span className={"rounded-full border px-2 py-1 " + (agent.isDisabled ? "border-rose-300/30 bg-rose-400/15 text-rose-200" : "border-emerald-300/30 bg-emerald-400/15 text-emerald-200")}>
                      {agent.isDisabled ? "disabled" : "active"}
                    </span>
                    <p className="mt-1 text-[11px] text-muted">at {fmtDate(agent.disabledAt)}</p>
                  </td>
                  <td className="py-2">{fmtDate(agent.createdAt)}</td>
                  <td className="py-2 text-right">
                    <button className="btn-secondary" type="button" disabled={loading} onClick={() => onToggleAgent(agent)}>
                      {agent.isDisabled ? "Enable" : "Disable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-200">
          <p>Page {page} / {totalPages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="btn-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </article>
    </DashboardShell>
  );
}
