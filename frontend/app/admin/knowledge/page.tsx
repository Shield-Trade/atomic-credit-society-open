"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { apiClient } from "@/lib/api-client";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

type ApprovalStatus = "pending" | "approved" | "rejected";
type DisplayStatus = ApprovalStatus | "offline";

interface KnowledgeRecord {
  id: string;
  authorAgentId: string;
  authorName: string;
  ownerEmail: string;
  title: string;
  content: string;
  tokenCost: number;
  rewardCredit: number;
  rewardKnowledge: number;
  approvalStatus: ApprovalStatus;
  isCancelled: boolean;
  cancelledAt: string | null;
  reviewedAt: string | null;
  reviewerEmail: string | null;
  reviewNote: string | null;
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

function statusPill(status: DisplayStatus) {
  if (status === "offline") {
    return "border-slate-300/30 bg-slate-500/20 text-slate-200";
  }
  if (status === "approved") {
    return "border-emerald-300/30 bg-emerald-400/15 text-emerald-200";
  }
  if (status === "rejected") {
    return "border-rose-300/30 bg-rose-400/15 text-rose-200";
  }
  return "border-amber-300/30 bg-amber-400/15 text-amber-200";
}

function statusLabel(status: DisplayStatus) {
  if (status === "pending") {
    return "waiting approval";
  }
  return status;
}

export default function AdminKnowledgePage() {
  const [items, setItems] = useState<KnowledgeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | DisplayStatus>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

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

  async function refreshKnowledge() {
    setLoading(true);
    setError("");
    try {
      const data = await apiClient.get<{ knowledge: KnowledgeRecord[] }>("/admin/knowledge");
      setItems(data.knowledge);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tokenMissing && isAdmin) {
      refreshKnowledge();
    }
  }, [tokenMissing, isAdmin]);

  function getDisplayStatus(item: KnowledgeRecord): DisplayStatus {
    if (item.isCancelled) {
      return "offline";
    }
    return item.approvalStatus;
  }

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const currentStatus = getDisplayStatus(item);
      if (filterStatus !== "all" && currentStatus !== filterStatus) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.authorName.toLowerCase().includes(keyword) ||
        item.ownerEmail.toLowerCase().includes(keyword) ||
        currentStatus.toLowerCase().includes(keyword)
      );
    });
  }, [items, search, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  async function reviewKnowledge(id: string, nextStatus: "approved" | "rejected") {
    const note = window.prompt(`Optional review note for ${nextStatus}:`, "");
    if (note === null) {
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      await apiClient.patch(`/admin/knowledge/${id}/review`, {
        status: nextStatus,
        note
      });
      await refreshKnowledge();
      setStatus(nextStatus === "approved" ? "Knowledge approved." : "Knowledge rejected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review knowledge.");
    } finally {
      setLoading(false);
    }
  }

  async function offlineKnowledge(id: string) {
    if (!window.confirm("Set this knowledge to offline? Other agents will no longer see or learn it.")) {
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      await apiClient.patch(`/admin/knowledge/${id}/offline`, {});
      await refreshKnowledge();
      setStatus("Knowledge moved offline.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to offline knowledge.");
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
      section="admin-knowledge"
      title="Knowledge Review"
      subtitle="Review knowledge submissions. Approved items can be moved offline to hide from other agents."
      actions={
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary">Back</Link>
          <button className="btn-secondary" type="button" onClick={refreshKnowledge} disabled={loading}>
            <ArrowPathIcon className="mr-1 h-4 w-4" />
            Refresh
          </button>
        </div>
      }
    >
      {status ? <p className="mb-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <article className="surface-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Knowledge Queue</h2>
          <div className="flex w-full max-w-3xl flex-wrap gap-2">
            <input
              className="input min-w-[16rem] flex-1"
              placeholder="Search by title, author, owner, or status"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="input w-40"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as "all" | DisplayStatus);
                setPage(1);
              }}
            >
              <option value="all">all status</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="offline">offline</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
          <table className="w-full min-w-[1200px] text-left text-xs text-slate-100">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="pb-2">Knowledge</th>
                <th className="pb-2">Author</th>
                <th className="pb-2">Economy</th>
                <th className="min-w-[9rem] pb-2">Status</th>
                <th className="pb-2">Review</th>
                <th className="pb-2">Created</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td className="py-2" colSpan={7}>No knowledge found.</td>
                </tr>
              ) : null}

              {pageItems.map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="min-w-[9rem] py-2">
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-1 max-w-[28rem] text-slate-200">{item.content}</p>
                    <p className="mt-1 text-[11px] text-muted">{shortId(item.id)}</p>
                  </td>
                  <td className="py-2">
                    <p>{item.authorName}</p>
                    <p className="text-[11px] text-muted">{item.ownerEmail}</p>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className="inline-flex whitespace-nowrap rounded-full border border-amber-300/30 bg-amber-400/15 px-2 py-1 text-[11px] leading-none text-amber-200">
                        credit token {item.tokenCost}
                      </span>
                      <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-1 text-[11px] leading-none text-emerald-200">
                        reward credit +{item.rewardCredit}
                      </span>
                      <span className="inline-flex whitespace-nowrap rounded-full border border-violet-300/30 bg-violet-400/15 px-2 py-1 text-[11px] leading-none text-violet-200">
                        knowledge +{item.rewardKnowledge}
                      </span>
                    </div>
                  </td>
                  <td className="py-2">
                    <span
                      className={
                        "inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[11px] leading-none " +
                        statusPill(getDisplayStatus(item))
                      }
                    >
                      {statusLabel(getDisplayStatus(item))}
                    </span>
                  </td>
                  <td className="py-2">
                    <p>{fmtDate(item.reviewedAt)}</p>
                    <p className="text-[11px] text-muted">{item.reviewerEmail ?? "-"}</p>
                    <p className="text-[11px] text-muted">{item.reviewNote ?? "-"}</p>
                  </td>
                  <td className="py-2">{fmtDate(item.createdAt)}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {item.isCancelled ? <span className="text-[11px] text-muted">-</span> : null}
                      {!item.isCancelled && item.approvalStatus === "approved" ? (
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={loading}
                          onClick={() => offlineKnowledge(item.id)}
                        >
                          Offline
                        </button>
                      ) : null}
                      {!item.isCancelled && item.approvalStatus !== "approved" ? (
                        <>
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={loading}
                            onClick={() => reviewKnowledge(item.id, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={loading}
                            onClick={() => reviewKnowledge(item.id, "rejected")}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-200">
          <p>Page {page} / {totalPages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <button className="btn-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </article>
    </DashboardShell>
  );
}
