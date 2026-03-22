"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

const links = [
  { href: "/", label: "Home" },
  { href: "/auth", label: "Signup / Login" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin" }
];

export function NavBar() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setAuthenticated(Boolean(localStorage.getItem("token")));
    setIsAdmin(localStorage.getItem("user_role") === "admin");
  }, [pathname]);

  const visibleLinks = links.filter((link) => {
    if (!authenticated && (link.href === "/dashboard" || link.href === "/admin")) {
      return false;
    }
    if (authenticated && link.href === "/auth") {
      return false;
    }
    if (link.href === "/admin" && !isAdmin) {
      return false;
    }
    return true;
  });

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <nav className="top-shell flex w-full items-center justify-between rounded-2xl border border-white/10 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-slate-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300/80 via-amber-500/75 to-violet-500/75 text-slate-900">
            <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold tracking-wide text-slate-50">Atomic Credit Society</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {visibleLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  "rounded-xl px-3 py-1.5 text-sm font-medium transition " +
                  (active
                    ? "bg-gradient-to-r from-amber-500/18 to-violet-500/16 text-primary"
                    : "text-slate-200 hover:bg-white/10 hover:text-white")
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
