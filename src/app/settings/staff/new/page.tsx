"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
};

export default function NewStaffPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.getUser();

        if (authError || !data.user) {
          throw new Error("Please sign in again.");
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("business_id, role, active")
          .eq("id", data.user.id)
          .single();

        if (
          profileError ||
          !profile ||
          profile.role !== "admin" ||
          !profile.active
        ) {
          throw new Error("Only active administrators can add staff.");
        }

        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("id, name")
          .eq("business_id", profile.business_id)
          .eq("active", true)
          .order("name");

        if (branchError) {
          throw new Error("Could not load branches. Refresh and try again.");
        }

        if (!cancelled) {
          setBranches(branchData ?? []);
          setAllowed(true);
        }
      } catch (problem) {
        if (!cancelled) {
          setError(
            problem instanceof Error
              ? problem.message
              : "Could not load staff setup.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || created || !allowed) return;

    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get("password") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");

    setError("");

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(values.get("fullName") ?? ""),
          email: String(values.get("email") ?? ""),
          password,
          phone: String(values.get("phone") ?? ""),
          role: String(values.get("role") ?? "cashier"),
          branchId: String(values.get("branchId") ?? "") || null,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error ??
            "Could not complete the request. Check Staff before retrying.",
        );
      }

      if (response.redirected || !result?.userId) {
        throw new Error(
          "Session changed. Sign in again and check Staff before retrying.",
        );
      }

      form.reset();
      setCreated(true);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Connection interrupted. Check Staff before retrying.",
      );
    } finally {
      setSaving(false);
    }
  }

  const field =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/settings" className="font-semibold text-blue-700">
          ← Back to Settings
        </Link>

        <h1 className="mt-6 text-3xl font-bold">Add Staff</h1>
        <p className="mt-2 text-slate-600">
          Create a login account for a staff member in your business.
        </p>

        {error && (
          <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-slate-600">Loading staff setup...</p>
        ) : created ? (
          <section
            role="status"
            className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6"
          >
            <h2 className="text-xl font-semibold text-emerald-700">
              Staff account created successfully
            </h2>
            <p className="mt-3 text-slate-600">
              No invitation email was sent. Share the login details privately
              with the staff member.
            </p>
            <Link
              href="/settings"
              className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
            >
              Return to Settings
            </Link>
          </section>
        ) : allowed ? (
          <form
            onSubmit={submit}
            className="mt-6 rounded-2xl border bg-white p-6 shadow-sm"
          >
            <fieldset disabled={saving} className="space-y-5">
              <label className="block font-semibold">
                Full name *
                <input
                  name="fullName"
                  required
                  maxLength={120}
                  autoComplete="name"
                  className={field}
                />
              </label>

              <label className="block font-semibold">
                Email *
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                  className={field}
                />
              </label>

              <label className="block font-semibold">
                Password *
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={field}
                />
              </label>

              <label className="block font-semibold">
                Confirm password *
                <input
                  name="confirmation"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={field}
                />
              </label>

              <label className="block font-semibold">
                Role *
                <select name="role" defaultValue="cashier" className={field}>
                  <option value="cashier">Cashier</option>
                  <option value="technician">Technician</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>

              <label className="block font-semibold">
                Branch
                <select name="branchId" defaultValue="" className={field}>
                  <option value="">No assigned branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block font-semibold">
                Phone
                <input
                  name="phone"
                  type="tel"
                  maxLength={30}
                  className={field}
                />
              </label>

              <p className="text-sm text-slate-500">
                The account will be active immediately. Use an email belonging
                to the intended staff member.
              </p>

              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Creating account..." : "Create Staff"}
              </button>
            </fieldset>
          </form>
        ) : null}
      </div>
    </main>
  );
}