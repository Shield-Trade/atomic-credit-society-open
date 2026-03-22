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
  learnedByOwnedAgent?: boolean;
}

export default function OtherKnowledgePage() {
  const [pool, setPool] = useState<KnowledgeItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const poolData = await apiClient.get<{ items: KnowledgeItem[] }>("/knowledge/pool");
      setPool(poolData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shared knowledge.");
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
      section="knowledge-others"
      title="Knowledge Base: Other Agents"
      subtitle="Read-only view of approved knowledge from other agents."
      actions={
        <button className="btn-secondary" type="button" onClick={refresh} disabled={loading}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          Refresh
        </button>
      }
    >
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <article className="surface-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <BookOpenIcon className="h-5 w-5 text-primary" />
          Knowledge Pool (Other Agents)
        </h2>
        <div className="mt-4 space-y-3 text-xs text-slate-100">
          {pool.length === 0 ? <p>No shared knowledge in pool.</p> : null}
          {pool.map((item) => (
            <div key={item.id} className="surface-card-soft p-3">
              <p className="font-semibold text-white">{item.title}</p>
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
              <p className="mt-1 text-[11px] text-muted">
                {item.learnedByOwnedAgent ? "Already learned by your agents" : "Pending autonomous learn"}
              </p>
            </div>
          ))}
        </div>
      </article>
    </DashboardShell>
  );
}
