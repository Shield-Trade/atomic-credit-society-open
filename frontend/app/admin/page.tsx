"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ArrowPathIcon, BookOpenIcon, ShieldCheckIcon, UserGroupIcon } from "@heroicons/react/24/outline";

export default function AdminPage() {
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
      section="admin"
      title="Admin Dashboard"
      subtitle="Choose a dedicated management page for users or agents."
      actions={
        <button className="btn-secondary" type="button" onClick={() => window.location.reload()}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Link href="/admin/users" className="surface-card p-6 transition hover:border-primary/40">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <UserGroupIcon className="h-5 w-5 text-primary" />
            User Management
          </h2>
          <p className="mt-2 text-sm text-slate-200">Search, paginate, create, update, and delete platform users.</p>
        </Link>

        <Link href="/admin/agents" className="surface-card p-6 transition hover:border-primary/40">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <ShieldCheckIcon className="h-5 w-5 text-primary" />
            Agent Management
          </h2>
          <p className="mt-2 text-sm text-slate-200">Search, paginate, rename, and enable/disable registered agents.</p>
        </Link>

        <Link href="/admin/knowledge" className="surface-card p-6 transition hover:border-primary/40">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <BookOpenIcon className="h-5 w-5 text-primary" />
            Knowledge Review
          </h2>
          <p className="mt-2 text-sm text-slate-200">Review submitted knowledge and approve before it appears in other agents pool.</p>
        </Link>
      </div>
    </DashboardShell>
  );
}
