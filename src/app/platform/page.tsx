import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/app/logout-button";
import type { PlatformSummary, SubscriptionAttention } from "@/lib/platform-dashboard";
import type { ReadinessOverview } from "@/lib/readiness";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients | InfoAxon Platform" };

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const role = await supabase.rpc("is_platform_admin");
  if (role.error) throw new Error("Unable to verify platform access.");
  if (role.data !== true) notFound();
  return { supabase, user };
}

async function createBusiness(form: FormData) {
  "use server";
  const { supabase } = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (name.length < 2 || name.length > 120 || !/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(code)) {
    redirect("/platform?error=invalid");
  }
  const { error } = await supabase.rpc("platform_create_business", {
    p_name: name, p_code: code,
  });
  if (error) redirect("/platform?error=" + (error.code === "23505" ? "duplicate" : "save"));
  redirect("/platform?created=1");
}

type Business = { id: string; name: string; code: string; active: boolean };
type SubscriptionOverview = { business_id: string; status: string; plan: string; ends_on: string | null };

export default async function PlatformPage({ searchParams }: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { supabase, user } = await requireAdmin();
  const query = await searchParams;
  const { data, error } = await supabase.rpc("platform_list_businesses");
  const businesses = (data ?? []) as Business[];
  const subscriptionsResult = await supabase.rpc("platform_list_subscription_overview");
  const [summaryResult, attentionResult, readinessResult] = await Promise.all([
    supabase.rpc("platform_dashboard_summary"),
    supabase.rpc("platform_subscription_attention"),
    supabase.rpc("platform_readiness_overview"),
  ]);
  const summary = summaryResult.data as PlatformSummary | null;
  const attention = (attentionResult.data ?? []) as SubscriptionAttention[];
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionOverview[];
  const readiness = (readinessResult.data ?? []) as ReadinessOverview[];
  const subscriptionFor = (id: string) => subscriptions.find((item) => item.business_id === id);
  const readinessFor = (id: string) => readiness.find((item) => item.business_id === id);
  const messages: Record<string, string> = {
    invalid: "Name: 2–120 characters. Code: 2–30 letters, numbers, hyphens or underscores.",
    duplicate: "That business code already exists. Choose another code.",
    save: "Could not save. Check the client list before retrying.",
  };
  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bold text-indigo-700">INFOAXON</p>
            <h1 className="mt-2 text-3xl font-bold">Client Businesses</h1>
            <p className="mt-2 break-all text-sm text-slate-600">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/platform/admins/new" className="rounded-xl bg-indigo-700 px-4 py-3 font-semibold text-white">Create Client Admin</a>
            <a href="/platform/admins" className="rounded-xl border border-indigo-700 px-4 py-3 font-semibold text-indigo-700">Manage Client Admins</a>
            <a href="/platform/audit" className="rounded-xl border border-indigo-700 px-4 py-3 font-semibold text-indigo-700">Audit log</a>
            <a href="/platform/health" className="rounded-xl border border-indigo-700 px-4 py-3 font-semibold text-indigo-700">System health</a>
            <LogoutButton />
          </div>
        </header>
        {query.error && <p role="alert" className="mt-6 rounded-xl bg-red-100 p-4 text-red-900">{messages[query.error] ?? messages.save}</p>}
        {query.created === "1" && !query.error && <p role="status" className="mt-6 rounded-xl bg-emerald-100 p-4 text-emerald-900">Business and Main Branch created. Client login setup is still pending.</p>}
        {summaryResult.error || !summary ? <p role="alert" className="mt-6 rounded-xl bg-red-100 p-4 text-red-900">Dashboard metrics are unavailable. Confirm migration 025 is applied.</p> : <>
          <section aria-label="Platform summary" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Client businesses", summary.total_businesses, `${summary.active_businesses} active · ${summary.inactive_businesses} inactive`],
              ["Subscriptions", summary.active_subscriptions + summary.trial_subscriptions, `${summary.trial_subscriptions} trial · ${summary.blocked_subscriptions} blocked`],
              ["Monthly recurring fee", new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(summary.monthly_recurring_fee), "Active and trial accounts"],
              ["Expiry alerts", summary.expiring_30_days, `${summary.expiring_7_days} within 7 days`],
              ["Active branches", summary.active_branches, "Across all client businesses"],
              ["Client administrators", summary.active_client_admins, "Active administrator accounts"],
              ["Enabled modules", summary.enabled_modules, "Total active client entitlements"],
              ["System status", summary.blocked_subscriptions ? "Attention" : "Healthy", summary.blocked_subscriptions ? "Review blocked subscriptions" : "No access blocks"],
            ].map(([title, value, note]) => <article key={title} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-600">{title}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></article>)}
          </section>
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Subscription attention</h2><p className="mt-1 text-sm text-slate-600">Blocked, expired or expiring within 30 days.</p></div></div>
            {attentionResult.error ? <p role="alert" className="mt-4 text-red-700">Could not load subscription alerts.</p> : attention.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Business</th><th className="p-3">Plan</th><th className="p-3">Status</th><th className="p-3">End date</th><th className="p-3">Time remaining</th><th className="p-3">Action</th></tr></thead><tbody>
              {attention.map(item => <tr key={item.business_id} className="border-b"><td className="p-3"><span className="font-semibold">{item.business_name}</span><br/><span className="text-xs text-slate-500">{item.business_code}</span></td><td className="p-3 capitalize">{item.plan}</td><td className="p-3 capitalize">{item.status.replace("_"," ")}</td><td className="p-3">{item.ends_on ?? "No end date"}</td><td className={`p-3 font-semibold ${(item.days_remaining ?? 1) < 0 ? "text-red-700" : (item.days_remaining ?? 31) <= 7 ? "text-amber-700" : ""}`}>{item.days_remaining === null ? "Review access" : item.days_remaining < 0 ? `${Math.abs(item.days_remaining)} days overdue` : item.days_remaining === 0 ? "Expires today" : `${item.days_remaining} days`}</td><td className="p-3"><a href={`/platform/businesses/${item.business_id}/subscription`} className="font-semibold text-indigo-700 underline">Review</a></td></tr>)}
            </tbody></table></div> : <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">No subscriptions need attention.</p>}
          </section>
        </>}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Add a business</h2>
          <form action={createBusiness} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="font-medium">Business name
              <input name="name" required minLength={2} maxLength={120} className={input} placeholder="Example Stationery" />
            </label>
            <label className="font-medium">Unique business code
              <input name="code" required minLength={2} maxLength={30} className={input} placeholder="EXAMPLE01" />
            </label>
            <p className="text-sm text-slate-600 sm:col-span-2">Code: letters, numbers, hyphens or underscores. Defaults: LKR, Asia/Colombo, Main Branch.</p>
            <button className="rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white hover:bg-indigo-800">Create Business</button>
          </form>
        </section>
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">All businesses</h2>
          <p className="mt-2 text-sm text-slate-600">Manage business details, branding, modules, client administrators and subscription access.</p>
          {error ? <p role="alert" className="mt-4 text-red-700">Could not load businesses. Confirm migration 018 was applied, then refresh.</p> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b"><th scope="col" className="p-3">Business</th><th scope="col" className="p-3">Code</th><th scope="col" className="p-3">Business</th><th scope="col" className="p-3">Subscription</th><th scope="col" className="p-3">Onboarding</th><th scope="col" className="p-3">Access</th><th scope="col" className="p-3">Settings</th></tr></thead>
                <tbody>{businesses.map((b) => { const s = subscriptionFor(b.id); const r = readinessFor(b.id); return <tr key={b.id} className="border-b"><td className="p-3">{b.name}</td><td className="p-3">{b.code}</td><td className="p-3">{b.active ? "Active" : "Inactive"}</td><td className="p-3 capitalize">{subscriptionsResult.error ? "Unavailable" : s ? `${s.plan} · ${s.status}${s.ends_on ? ` · ends ${s.ends_on}` : ""}` : "Not configured"}</td><td className="p-3">{readinessResult.error ? "Unavailable" : r ? <a className={`font-semibold underline ${r.ready ? "text-emerald-700" : "text-amber-700"}`} href={`/platform/businesses/${b.id}/readiness`}>{r.ready ? "Ready" : `${r.completed_steps}/${r.total_steps} complete`}</a> : "Pending"}</td><td className="p-3"><a className="font-semibold text-indigo-700 underline" href={`/platform/admins?business=${b.id}`} aria-label={`Open ${b.name} access center`}>Open client</a></td><td className="p-3"><a className="font-semibold text-indigo-700 underline" href={`/platform/businesses/${b.id}`} aria-label={`Manage ${b.name}`}>Manage</a></td></tr>; })}</tbody>
              </table>
              {businesses.length === 0 && <p className="py-4 text-slate-600">No businesses yet.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
