"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { DashboardShell } from "@/components/DashboardShell";
import { apiClient } from "@/lib/api-client";

interface AgentRow {
  id: string;
  name: string;
  isDisabled: boolean;
  creditScore: number;
}

interface StepState {
  ok: boolean;
  detail: string;
}

interface FlowResult {
  publisherName: string;
  learnerName: string;
  knowledgeId: string;
  creditBefore: number;
  creditAfter: number;
  steps: {
    publish: StepState;
    approve: StepState;
    searchable: StepState;
    learn: StepState;
    creditEarned: StepState;
  };
}

function StepPill({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] " +
        (ok
          ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
          : "border-rose-300/30 bg-rose-400/15 text-rose-200")
      }
    >
      {ok ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <XCircleIcon className="h-3.5 w-3.5" />}
      {text}
    </span>
  );
}

export default function KnowledgeEconomyDemoPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<FlowResult | null>(null);

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  async function loadAgents() {
    const data = await apiClient.get<{ agents: AgentRow[] }>("/agent/");
    setAgents(data.agents.filter((item) => !item.isDisabled));
    return data.agents.filter((item) => !item.isDisabled);
  }

  async function ensureTwoAgents() {
    let current = await loadAgents();
    while (current.length < 2) {
      await apiClient.post("/agent/create", {
        name: `Demo Agent ${Date.now().toString().slice(-6)}`
      });
      current = await loadAgents();
    }
    return current;
  }

  async function runFlow() {
    setLoading(true);
    setError("");
    setStatus("");
    setResult(null);

    try {
      const availableAgents = await ensureTwoAgents();
      const publisher = availableAgents[0];
      const learner = availableAgents[1];

      const learnerBefore = await apiClient.get<{ agent: AgentRow }>("/agent/" + learner.id);

      const publishRes = await apiClient.post<{
        knowledge: { id: string };
      }>("/knowledge/publish", {
        agentId: publisher.id,
        title: `Knowledge Economy Demo ${new Date().toISOString()}`,
        content:
          "Demo flow: publish -> admin approve -> another agent learns -> learner earns +1 credit and +1 knowledge.",
        tokenCost: 3,
        rewardCredit: 1
      });

      const knowledgeId = publishRes.knowledge.id;

      await apiClient.patch(`/admin/knowledge/${knowledgeId}/review`, {
        status: "approved",
        note: "Approved by knowledge economy demo flow."
      });

      const reviewed = await apiClient.get<{
        knowledge: Array<{ id: string; approvalStatus: "pending" | "approved" | "rejected"; isCancelled: boolean }>;
      }>("/admin/knowledge");
      const approvedKnowledge = reviewed.knowledge.find((item) => item.id === knowledgeId);
      const searchable = approvedKnowledge?.approvalStatus === "approved" && !approvedKnowledge.isCancelled;

      await apiClient.post("/knowledge/learn", {
        knowledgeId,
        learnerAgentId: learner.id
      });

      const learnerAfter = await apiClient.get<{ agent: AgentRow }>("/agent/" + learner.id);
      const creditDelta = learnerAfter.agent.creditScore - learnerBefore.agent.creditScore;

      const nextResult: FlowResult = {
        publisherName: publisher.name,
        learnerName: learner.name,
        knowledgeId,
        creditBefore: learnerBefore.agent.creditScore,
        creditAfter: learnerAfter.agent.creditScore,
        steps: {
          publish: { ok: true, detail: "Knowledge published successfully." },
          approve: { ok: true, detail: "Admin approved this knowledge." },
          searchable: {
            ok: searchable,
            detail: searchable
              ? "Knowledge is approved and eligible for learning."
              : "Knowledge is not in approved state after review."
          },
          learn: { ok: true, detail: "Another agent learned this knowledge." },
          creditEarned: {
            ok: creditDelta >= 1,
            detail: `Learner credit ${learnerBefore.agent.creditScore} -> ${learnerAfter.agent.creditScore}`
          }
        }
      };

      setResult(nextResult);
      setStatus("Knowledge Economy demo completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Knowledge Economy demo failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tokenMissing) {
      loadAgents().catch(() => {
        // ignore initial fetch error here; user can click run to retry.
      });
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
      section="demo-knowledge-economy"
      title="Demo: Knowledge Economy"
      subtitle="Complete test flow: publish -> approve -> another agent learn -> earn credit."
      actions={
        <button className="btn-secondary" type="button" onClick={runFlow} disabled={loading}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          {loading ? "Running..." : "Run Full Demo"}
        </button>
      }
    >
      {status ? <p className="mb-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      <article className="surface-card p-5">
        <h2 className="text-base font-semibold text-white">Test Plan</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-200">
          <li>Agent A publishes knowledge.</li>
          <li>Admin approves this knowledge.</li>
          <li>Validate this knowledge is approved and eligible for learning.</li>
          <li>Agent B learns this approved knowledge.</li>
          <li>Validate Agent B credit score increases.</li>
        </ol>
      </article>

      {result ? (
        <article className="surface-card mt-5 p-5">
          <h2 className="text-base font-semibold text-white">Execution Result</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-slate-100">
              publisher: {result.publisherName}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-slate-100">
              learner: {result.learnerName}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-slate-100">
              knowledge: {result.knowledgeId.slice(0, 8)}...
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="surface-card-soft p-3 text-xs text-slate-100">
              <p className="font-semibold">Step 1 Publish</p>
              <StepPill ok={result.steps.publish.ok} text={result.steps.publish.ok ? "PASS" : "FAIL"} />
              <p className="mt-2 text-slate-300">{result.steps.publish.detail}</p>
            </div>
            <div className="surface-card-soft p-3 text-xs text-slate-100">
              <p className="font-semibold">Step 2 Approve</p>
              <StepPill ok={result.steps.approve.ok} text={result.steps.approve.ok ? "PASS" : "FAIL"} />
              <p className="mt-2 text-slate-300">{result.steps.approve.detail}</p>
            </div>
            <div className="surface-card-soft p-3 text-xs text-slate-100">
              <p className="font-semibold">Step 3 Searchable</p>
              <StepPill ok={result.steps.searchable.ok} text={result.steps.searchable.ok ? "PASS" : "FAIL"} />
              <p className="mt-2 text-slate-300">{result.steps.searchable.detail}</p>
            </div>
            <div className="surface-card-soft p-3 text-xs text-slate-100">
              <p className="font-semibold">Step 4 Learn + Earn Credit</p>
              <StepPill ok={result.steps.learn.ok} text={result.steps.learn.ok ? "PASS" : "FAIL"} />
              <p className="mt-2 text-slate-300">{result.steps.learn.detail}</p>
              <p className="mt-1 text-slate-300">{result.steps.creditEarned.detail}</p>
            </div>
          </div>
        </article>
      ) : null}
    </DashboardShell>
  );
}
