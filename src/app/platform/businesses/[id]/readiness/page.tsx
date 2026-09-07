import { notFound } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platform/access";
import { UUID } from "@/lib/branding";
import type { BusinessReadiness } from "@/lib/readiness";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client Readiness | InfoAxon Platform" };

export default async function ReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const client = await requirePlatformAccess();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data, error } = await client.rpc("platform_business_readiness", { p_business: id });
  if (!error && !data) notFound();
  const readiness = data as BusinessReadiness | null;
  const steps = readiness ? [
    { title: "Business profile", detail: "Phone, email and address", complete: readiness.profile_complete, href: `/platform/businesses/${id}` },
    { title: "Business branding", detail: "Client logo uploaded", complete: readiness.branding_complete, href: `/platform/businesses/${id}` },
    { title: "Subscription access", detail: "Current trial or active licence", complete: readiness.subscription_complete, href: `/platform/businesses/${id}/subscription` },
    { title: "Enabled modules", detail: `${readiness.enabled_module_count} module${readiness.enabled_module_count === 1 ? "" : "s"} enabled`, complete: readiness.modules_complete, href: `/platform/businesses/${id}/modules` },
    { title: "Main branch", detail: "An active main branch", complete: readiness.main_branch_complete, href: `/platform/businesses/${id}/branches` },
    { title: "Client administrator", detail: "At least one active client admin", complete: readiness.active_admin_complete, href: `/platform/admins?business=${id}` },
  ] : [];
  const ready = Boolean(readiness?.business_active && readiness.completed_steps === readiness.total_steps);
  const percentage = readiness ? Math.round(readiness.completed_steps / readiness.total_steps * 100) : 0;

  return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900"><div className="mx-auto max-w-5xl">
    <a href={`/platform/businesses/${id}`} className="font-semibold text-indigo-700">← Business settings</a>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">Client onboarding readiness</h1>{readiness && <p className="mt-2 text-slate-600">{readiness.business_name} · {readiness.business_code}</p>}</div>{readiness && <span className={`rounded-full px-4 py-2 text-sm font-semibold ${ready ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{ready ? "Ready for client handover" : "Setup in progress"}</span>}</div>
    {error || !readiness ? <p role="alert" className="mt-6 rounded-xl bg-red-100 p-4 text-red-900">Unable to load readiness. Confirm migration 026 is applied.</p> : <>
      {!readiness.business_active && <p role="alert" className="mt-6 rounded-xl bg-red-100 p-4 text-red-900">This business is inactive. Activate it in Business settings before handover.</p>}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Setup progress</h2><p className="mt-1 text-sm text-slate-600">{readiness.completed_steps} of {readiness.total_steps} required items complete</p></div><p className="text-3xl font-bold text-indigo-700">{percentage}%</p></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-700" style={{ width: `${percentage}%` }} /></div></section>
      <section className="mt-6 grid gap-4 sm:grid-cols-2">{steps.map(step => <article key={step.title} className={`rounded-2xl border p-5 shadow-sm ${step.complete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-white"}`}><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{step.title}</h2><p className="mt-1 text-sm text-slate-600">{step.detail}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${step.complete ? "bg-emerald-200 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{step.complete ? "Complete" : "Pending"}</span></div>{!step.complete && <a href={step.href} className="mt-4 inline-block font-semibold text-indigo-700 underline">Fix this item</a>}</article>)}</section>
      <p className={`mt-6 rounded-xl p-4 ${ready ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>{ready ? "All required setup items are complete. This client is ready for login handover and QA." : "Complete the pending items before giving production access to the client."}</p>
    </>}
  </div></main>;
}
