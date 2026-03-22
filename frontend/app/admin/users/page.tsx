"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { apiClient } from "@/lib/api-client";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

interface UserRecord {
  id: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
}

function fmtDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"user" | "admin">("user");

  const [editUserId, setEditUserId] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");

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

  async function refreshUsers() {
    setLoading(true);
    setError("");
    try {
      const data = await apiClient.get<{ users: UserRecord[] }>("/admin/users");
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tokenMissing && isAdmin) {
      refreshUsers();
    }
  }, [tokenMissing, isAdmin]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return users;
    }
    return users.filter((user) => user.email.toLowerCase().includes(keyword) || user.role.toLowerCase().includes(keyword));
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page]);

  async function onCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");
    try {
      await apiClient.post("/admin/users", {
        email: createEmail.trim(),
        password: createPassword,
        role: createRole
      });
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("user");
      await refreshUsers();
      setStatus("User created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setLoading(false);
    }
  }

  async function onEditUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editUserId) {
      setError("Select a user before updating.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      const payload: { email?: string; password?: string; role?: "user" | "admin" } = {
        role: editRole
      };
      if (editEmail.trim()) {
        payload.email = editEmail.trim();
      }
      if (editPassword.trim()) {
        payload.password = editPassword;
      }

      await apiClient.patch(`/admin/users/${editUserId}`, payload);
      await refreshUsers();
      setEditPassword("");
      setStatus("User updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteUser(userId: string) {
    if (!window.confirm("Delete this user and related data?")) {
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      await refreshUsers();
      setStatus("User deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
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
      section="admin-users"
      title="User Management"
      subtitle="Search, modify, status review, and pagination for platform users."
      actions={
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary">Back</Link>
          <button className="btn-secondary" type="button" onClick={refreshUsers} disabled={loading}>
            <ArrowPathIcon className="mr-1 h-4 w-4" />
            Refresh
          </button>
        </div>
      }
    >
      {status ? <p className="mb-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <article className="surface-card p-5">
          <h2 className="text-base font-semibold text-white">Create User</h2>
          <form className="mt-4 grid gap-3" onSubmit={onCreateUser}>
            <input className="input" placeholder="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required />
            <input className="input" type="password" minLength={8} placeholder="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} required />
            <select className="input" value={createRole} onChange={(e) => setCreateRole(e.target.value as "user" | "admin")}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button className="btn-primary" type="submit" disabled={loading}>Create</button>
          </form>
        </article>

        <article className="surface-card p-5">
          <h2 className="text-base font-semibold text-white">Modify User</h2>
          <form className="mt-4 grid gap-3" onSubmit={onEditUser}>
            <select
              className="input"
              value={editUserId}
              onChange={(e) => {
                const selected = users.find((user) => user.id === e.target.value);
                setEditUserId(e.target.value);
                setEditEmail(selected?.email ?? "");
                setEditRole(selected?.role ?? "user");
              }}
              required
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.email} ({user.role})</option>
              ))}
            </select>
            <input className="input" placeholder="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            <input className="input" type="password" minLength={8} placeholder="new password (optional)" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} />
            <select className="input" value={editRole} onChange={(e) => setEditRole(e.target.value as "user" | "admin")}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button className="btn-secondary" type="submit" disabled={loading}>Update</button>
          </form>
        </article>
      </div>

      <article className="surface-card mt-5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Users</h2>
          <input className="input w-full max-w-sm" placeholder="Search by email or role" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-3">
          <table className="w-full min-w-[760px] text-left text-xs text-slate-100">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Created</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.length === 0 ? (
                <tr>
                  <td className="py-2" colSpan={5}>No users found.</td>
                </tr>
              ) : null}
              {pageUsers.map((user) => (
                <tr key={user.id} className="border-t border-white/10">
                  <td className="py-2">{user.email}</td>
                  <td className="py-2">{user.role}</td>
                  <td className="py-2"><span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-1 text-emerald-200">active</span></td>
                  <td className="py-2">{fmtDate(user.createdAt)}</td>
                  <td className="py-2 text-right">
                    <button className="btn-secondary" type="button" onClick={() => onDeleteUser(user.id)} disabled={loading}>Delete</button>
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
