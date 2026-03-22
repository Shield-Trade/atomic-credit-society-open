"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import {
  ArrowLeftOnRectangleIcon,
  BeakerIcon,
  ChartBarSquareIcon,
  ClockIcon,
  Cog6ToothIcon,
  BoltIcon,
  BookOpenIcon,
  MoonIcon,
  KeyIcon,
  SunIcon,
  ShieldCheckIcon,
  WalletIcon
} from "@heroicons/react/24/outline";

type DashboardSection =
  | "dashboard"
  | "wallet"
  | "history"
  | "activity"
  | "knowledge"
  | "knowledge-my"
  | "knowledge-others"
  | "demo"
  | "demo-knowledge-economy"
  | "demo-agent-finance"
  | "password"
  | "admin"
  | "admin-users"
  | "admin-agents"
  | "admin-knowledge";
type ThemeMode = "dark" | "light";

interface DashboardShellProps {
  section: DashboardSection;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}

function navClass(active: boolean) {
  if (active) {
    return "flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-500/15 to-violet-500/10 px-3 py-2 text-primary";
  }
  return "flex items-center gap-3 rounded-xl px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white";
}

function subNavClass(active: boolean) {
  if (active) {
    return "ml-8 flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500/15 to-violet-500/10 px-3 py-1.5 text-xs text-primary";
  }
  return "ml-8 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white";
}

export function DashboardShell({ section, title, subtitle, actions, children }: DashboardShellProps) {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [settingOpen, setSettingOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(true);
  const [demoOpen, setDemoOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [userEmail, setUserEmail] = useState("-");
  const [userRole, setUserRole] = useState<"user" | "admin">("user");

  useEffect(() => {
    const storedTheme = (localStorage.getItem("theme_mode") as ThemeMode | null) ?? "dark";
    setTheme(storedTheme);
    document.documentElement.setAttribute("data-theme", storedTheme);
    setUserEmail(localStorage.getItem("user_email") || "operator@acs.dev");
    setUserRole((localStorage.getItem("user_role") as "user" | "admin" | null) ?? "user");
  }, []);

  function applyTheme(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem("theme_mode", mode);
    document.documentElement.setAttribute("data-theme", mode);
  }

  function onLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_role");
    window.location.href = "/auth";
  }

  const knowledgeActive = section === "knowledge" || section === "knowledge-my" || section === "knowledge-others";
  const demoActive = section === "demo" || section === "demo-knowledge-economy" || section === "demo-agent-finance";
  const adminActive =
    section === "admin" || section === "admin-users" || section === "admin-agents" || section === "admin-knowledge";

  useEffect(() => {
    if (knowledgeActive) {
      setKnowledgeOpen(true);
    }
    if (demoActive) {
      setDemoOpen(true);
    }
    if (adminActive) {
      setAdminOpen(true);
    }
  }, [knowledgeActive, demoActive, adminActive]);

  return (
    <section className="relative min-h-[calc(100vh-7rem)] w-full">
      <aside className="surface-card-soft fixed bottom-4 left-4 top-24 z-20 hidden w-64 flex-col overflow-hidden border border-white/10 md:flex">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Operator</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-100">{userEmail}</p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          <Link href="/dashboard" className={navClass(section === "dashboard")}>
            <ChartBarSquareIcon className="h-4 w-4" />
            Dashboard
          </Link>
          <Link href="/dashboard/wallet" className={navClass(section === "wallet")}>
            <WalletIcon className="h-4 w-4" />
            Wallet
          </Link>
          <Link href="/dashboard/history" className={navClass(section === "history")}>
            <ClockIcon className="h-4 w-4" />
            History
          </Link>
          <Link href="/dashboard/activity" className={navClass(section === "activity")}>
            <BoltIcon className="h-4 w-4" />
            Activity
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/knowledge/my" className={navClass(knowledgeActive) + " flex-1"}>
              <BookOpenIcon className="h-4 w-4" />
              Knowledge Base
            </Link>
            <button
              type="button"
              aria-label={knowledgeOpen ? "Collapse knowledge menu" : "Expand knowledge menu"}
              className="rounded-lg px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
              onClick={() => setKnowledgeOpen((prev) => !prev)}
            >
              {knowledgeOpen ? "-" : "+"}
            </button>
          </div>
          {knowledgeOpen ? (
            <>
              <Link href="/dashboard/knowledge/my" className={subNavClass(section === "knowledge-my")}>
                My Agents
              </Link>
              <Link href="/dashboard/knowledge/others" className={subNavClass(section === "knowledge-others")}>
                Other Agents
              </Link>
            </>
          ) : null}
          <div className="flex items-center gap-2">
            <Link href="/dashboard/demo/knowledge-economy" className={navClass(demoActive) + " flex-1"}>
              <BeakerIcon className="h-4 w-4" />
              Demo
            </Link>
            <button
              type="button"
              aria-label={demoOpen ? "Collapse demo menu" : "Expand demo menu"}
              className="rounded-lg px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
              onClick={() => setDemoOpen((prev) => !prev)}
            >
              {demoOpen ? "-" : "+"}
            </button>
          </div>
          {demoOpen ? (
            <>
              <Link href="/dashboard/demo/knowledge-economy" className={subNavClass(section === "demo-knowledge-economy")}>
                Knowledge Economy
              </Link>
              <Link href="/dashboard/demo/agent-finance" className={subNavClass(section === "demo-agent-finance")}>
                Agent Finance
              </Link>
            </>
          ) : null}
          <Link href="/dashboard/password" className={navClass(section === "password")}>
            <KeyIcon className="h-4 w-4" />
            Password
          </Link>
          {userRole === "admin" ? (
            <>
              <div className="flex items-center gap-2">
                <Link href="/admin" className={navClass(adminActive) + " flex-1"}>
                  <ShieldCheckIcon className="h-4 w-4" />
                  Admin
                </Link>
                <button
                  type="button"
                  aria-label={adminOpen ? "Collapse admin menu" : "Expand admin menu"}
                  className="rounded-lg px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                  onClick={() => setAdminOpen((prev) => !prev)}
                >
                  {adminOpen ? "-" : "+"}
                </button>
              </div>
              {adminOpen ? (
                <>
                  <Link href="/admin/users" className={subNavClass(section === "admin-users")}>
                    Users
                  </Link>
                  <Link href="/admin/agents" className={subNavClass(section === "admin-agents")}>
                    Agents
                  </Link>
                  <Link href="/admin/knowledge" className={subNavClass(section === "admin-knowledge")}>
                    Knowledge
                  </Link>
                </>
              ) : null}
            </>
          ) : null}
        </nav>

        <div className="mt-auto border-t border-white/10 px-3 py-4">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => setSettingOpen((prev) => !prev)}
          >
            <span className="flex items-center gap-3">
              <Cog6ToothIcon className="h-4 w-4" />
              Settings
            </span>
            <span className="text-xs text-muted">{settingOpen ? "Hide" : "Show"}</span>
          </button>

          {settingOpen ? (
            <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
              <p className="mb-2 px-2 text-xs uppercase tracking-[0.12em] text-muted">Theme</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={
                    "flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs " +
                    (theme === "dark" ? "bg-amber-500/20 text-amber-200" : "bg-white/5 text-slate-300")
                  }
                  onClick={() => applyTheme("dark")}
                >
                  <MoonIcon className="h-3.5 w-3.5" />
                  Dark
                </button>
                <button
                  type="button"
                  className={
                    "flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs " +
                    (theme === "light" ? "bg-amber-500/20 text-amber-200" : "bg-white/5 text-slate-300")
                  }
                  onClick={() => applyTheme("light")}
                >
                  <SunIcon className="h-3.5 w-3.5" />
                  Light
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-200"
            onClick={onLogout}
          >
            <ArrowLeftOnRectangleIcon className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      <div className="w-full md:pl-[17.5rem]">
        <header className="surface-card mb-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Agent Console</p>
              <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-200/90">{subtitle}</p>
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        </header>

        {children}
      </div>
    </section>
  );
}
