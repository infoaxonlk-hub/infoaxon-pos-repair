"use client";

import { useFormStatus } from "react-dom";
import { login } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in..." : label}
    </button>
  );
}

export function LoginForm({ defaultEmail = "", buttonLabel = "Sign in to system" }: { defaultEmail?: string; buttonLabel?: string }) {

  return (
    <>
      <form action={login} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Email address
          </label>

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultEmail}
            required
            placeholder="admin@example.com"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-sm font-semibold text-slate-700"
            >
              Password
            </label>

            <span className="text-xs text-slate-400">
              Contact your administrator
            </span>
          </div>

          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <SubmitButton label={buttonLabel} />
      </form>
    </>
  );
}
