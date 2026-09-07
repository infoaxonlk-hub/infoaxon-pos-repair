import { requirePlatformAccess } from "@/lib/platform/access";
import type { PlatformHealthIssue } from "@/lib/platform-health";

export const dynamic = "force-dynamic";
export const metadata = { title: "System Health | InfoAxon Platform" };

export default async function PlatformHealthPage() {
  const client = await requirePlatformAccess();
  const { data, error } = await client.rpc("platform_health_issues");
  const issues = (data ?? []) as PlatformHealthIssue[];
  const critical = issues.filter(issue => issue.severity === "critical").length;
  const warnings = issues.filter(issue => issue.severity === "warning").length;
  const healthy = !error && critical === 0 && warnings === 0;
  return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900"><div className="mx-auto max-w-6xl">
    <a href="/platform" className="font-semibold text-indigo-700">← Client businesses</a>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">Platform system health</h1><p className="mt-2 text-slate-600">Safe, read-only checks for client access and essential configuration.</p></div><span className={`rounded-full px-4 py-2 text-sm font-semibold ${healthy ? "bg-emerald-100 text-emerald-900" : error || critical ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{error ? "Check unavailable" : healthy ? "Healthy" : critical ? "Action required" : "Review warnings"}</span></div>
    {error ? <p role="alert" className="mt-6 rounded-xl bg-red-100 p-4 text-red-900">Health checks could not run. Confirm migration 027 is applied, then retry.</p> : <>
      <section aria-label="Health summary" className="mt-6 grid gap-4 sm:grid-cols-3"><article className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Critical issues</p><p className={`mt-2 text-3xl font-bold ${critical ? "text-red-700" : "text-emerald-700"}`}>{critical}</p></article><article className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Warnings</p><p className={`mt-2 text-3xl font-bold ${warnings ? "text-amber-700" : "text-emerald-700"}`}>{warnings}</p></article><article className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">Check coverage</p><p className="mt-2 text-3xl font-bold">6</p><p className="mt-1 text-xs text-slate-500">Subscription, branch, admin, modules, profile and branding</p></article></section>
      <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="p-6"><h2 className="text-xl font-semibold">Detected issues</h2><p className="mt-1 text-sm text-slate-600">Only active client businesses are included.</p></div>{issues.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-y bg-slate-50"><th className="p-4">Severity</th><th className="p-4">Business</th><th className="p-4">Check</th><th className="p-4">Details</th><th className="p-4">Action</th></tr></thead><tbody>{issues.map(issue => <tr key={`${issue.business_id}-${issue.issue_code}`} className="border-b"><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${issue.severity === "critical" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{issue.severity === "critical" ? "Critical" : "Warning"}</span></td><td className="p-4"><span className="font-semibold">{issue.business_name}</span><br/><span className="text-xs text-slate-500">{issue.business_code}</span></td><td className="p-4 capitalize">{issue.issue_code.replaceAll("_"," ")}</td><td className="p-4 text-slate-600">{issue.detail}</td><td className="p-4"><a href={issue.action_path} className="font-semibold text-indigo-700 underline">Review</a></td></tr>)}</tbody></table></div> : <p className="m-6 rounded-xl bg-emerald-50 p-4 text-emerald-900">No health issues detected. Essential client access configuration is complete.</p>}</section>
    </>}
  </div></main>;
}
