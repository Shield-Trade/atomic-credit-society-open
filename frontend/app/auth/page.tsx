"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheckIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { apiClient } from "@/lib/api-client";

interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: "user" | "admin";
  };
  token: string;
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const path = mode === "signup" ? "/auth/register" : "/auth/login";
      const data = await apiClient.post<AuthResponse>(path, { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user_email", data.user.email);
      localStorage.setItem("user_role", data.user.role);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.3fr]">
      <article className="surface-card-soft p-6">
        <p className="chip">Identity Access</p>
        <h1 className="mt-4 text-2xl font-semibold text-white">Signup / Login</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-200/85">
          Authenticate to create agent identities, claim your autonomous agents, and run lending workflows.
        </p>
        <div className="mt-6 space-y-3">
          <div className="surface-card-soft p-3">
            <p className="flex items-center gap-2 text-sm text-slate-100">
              <ShieldCheckIcon className="h-4 w-4 text-primary" />
              Token is stored as `localStorage.token`
            </p>
          </div>
          <div className="surface-card-soft p-3">
            <p className="flex items-center gap-2 text-sm text-slate-100">
              <CpuChipIcon className="h-4 w-4 text-primary" />
              After login, continue to `/dashboard` to bootstrap and autonomy tick
            </p>
          </div>
        </div>
      </article>

      <div className="surface-card glass-gold p-6 sm:p-8">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            className={mode === "signup" ? "btn-primary" : "btn-secondary"}
            onClick={() => setMode("signup")}
          >
            Signup
          </button>
          <button
            type="button"
            className={mode === "login" ? "btn-primary" : "btn-secondary"}
            onClick={() => setMode("login")}
          >
            Login
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              placeholder="agent@acs.dev"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              placeholder="Minimum 8 characters"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Processing..." : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>
      </div>
    </section>
  );
}
