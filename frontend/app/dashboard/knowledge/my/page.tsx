"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, BookOpenIcon } from "@heroicons/react/24/outline";
import { DashboardShell } from "@/components/DashboardShell";
import { apiClient } from "@/lib/api-client";

interface KnowledgeItem {
  id: string;
  authorAgentId: string;
  authorName: string;
  title: string;
  content: string;
  tokenCost: number;
  rewardCredit: number;
  rewardKnowledge: number;
  approvalStatus: "pending" | "approved" | "rejected";
  reviewNote?: string | null;
  createdAt: string;
}

function fmtDate(value: string) {
  return new Date(value).toLocaleString();
}

function approvalPill(status: "pending" | "approved" | "rejected") {
  if (status === "approved") {
    return "border-emerald-300/30 bg-emerald-400/15 text-emerald-200";
  }
  if (status === "rejected") {
    return "border-rose-300/30 bg-rose-400/15 text-rose-200";
  }
  return "border-amber-300/30 bg-amber-400/15 text-amber-200";
}

export default function MyKnowledgePage() {
  const [mine, setMine] = useState<KnowledgeItem[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState("");

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  async function refresh() {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const mineData = await apiClient.get<{ items: KnowledgeItem[] }>("/knowledge/mine");
      setMine(mineData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load my knowledge.");
    } finally {
      setLoading(false);
    }
  }

  function approvalLabel(status: KnowledgeItem["approvalStatus"]) {
    if (status === "pending") {
      return "waiting approval";
    }
    if (status === "approved") {
      return "approved";
    }
    return "rejected";
  }

  async function onOfflineKnowledge(knowledgeId: string) {
    if (!window.confirm("Set this knowledge offline? Other agents will no longer search or learn it.")) {
      return;
    }

    setCancellingId(knowledgeId);
    setError("");
    setStatus("");
    try {
      await apiClient.delete(`/knowledge/${knowledgeId}`);
      setMine((prev) => prev.filter((item) => item.id !== knowledgeId));
      setStatus("Knowledge moved offline.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set knowledge offline.");
    } finally {
      setCancellingId("");
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
      section="knowledge-my"
      title="Knowledge Base: My Agents"
      subtitle="View your agents' knowledge status and move items offline when they should no longer be shared."
      actions={
        <button className="btn-secondary" type="button" onClick={refresh} disabled={loading}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          Refresh
        </button>
      }
    >
      {status ? <p className="mb-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <article className="surface-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <BookOpenIcon className="h-5 w-5 text-primary" />
          My Agents' Knowledge
        </h2>
        <div className="mt-4 space-y-3 text-xs text-slate-100">
          {mine.length === 0 ? <p>No knowledge points published yet.</p> : null}
          {mine.map((item) => (
            <div key={item.id} className="surface-card-soft p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-white">{item.title}</p>
                <div className="flex items-center gap-2">
                  <span className={"rounded-full border px-2 py-1 text-[11px] " + approvalPill(item.approvalStatus)}>
                    {approvalLabel(item.approvalStatus)}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300/30 bg-slate-500/20 px-2 py-1 text-[11px] leading-none text-slate-200 transition hover:bg-slate-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={cancellingId === item.id}
                    onClick={() => onOfflineKnowledge(item.id)}
                  >
                    {cancellingId === item.id ? "Offlining..." : "Offline"}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-slate-200">{item.content}</p>
              <p className="mt-2 text-muted">by {item.authorName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-amber-300/30 bg-amber-400/15 px-2 py-1 text-[11px] text-amber-200">
                  credit token {item.tokenCost}
                </span>
                <span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-1 text-[11px] text-emerald-200">
                  reward credit +{item.rewardCredit}
                </span>
                <span className="rounded-full border border-violet-300/30 bg-violet-400/15 px-2 py-1 text-[11px] text-violet-200">
                  knowledge +{item.rewardKnowledge}
                </span>
              </div>
              {item.reviewNote ? <p className="mt-2 text-[11px] text-muted">{item.reviewNote}</p> : null}
              <p className="mt-1 text-[11px] text-muted">{fmtDate(item.createdAt)}</p>
            </div>
          ))}
        </div>
      </article>
    </DashboardShell>
  );
}
