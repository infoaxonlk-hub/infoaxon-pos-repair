import Link from "next/link";
import {requirePlatformAccess} from "@/lib/platform/access";
import {UUID} from "@/lib/branding";
import {AUDIT_ACTIONS,actionLabel,type AuditEntry} from "@/lib/audit";
export const dynamic="force-dynamic";
export const metadata={title:"Audit Log | InfoAxon Platform"};
type Business={id:string;name:string;code:string;active:boolean};
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
export default async function Page({searchParams}:{searchParams:Promise<{business?:string;action?:string;from?:string;to?:string}>}){
 const client=await requirePlatformAccess();const query=await searchParams;
 const business=query.business&&UUID.test(query.business)?query.business:null;
 const action=query.action&&AUDIT_ACTIONS.includes(query.action as never)?query.action:null;
 const from=query.from&&datePattern.test(query.from)?`${query.from}T00:00:00Z`:null;
 const to=query.to&&datePattern.test(query.to)?`${query.to}T23:59:59.999Z`:null;
 const [businessesResult,auditResult]=await Promise.all([
  client.rpc("platform_list_businesses"),client.rpc("platform_list_audit_log",{p_business:business,p_action:action,p_from:from,p_to:to,p_offset:0,p_limit:100})
 ]);
 const businesses=(businessesResult.data??[]) as Business[],entries=(auditResult.data??[]) as AuditEntry[];
 const field="rounded-xl border border-slate-300 bg-white p-3";
 return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900"><div className="mx-auto max-w-7xl">
  <Link href="/platform" className="font-semibold text-indigo-700">← Client businesses</Link>
  <h1 className="mt-5 text-3xl font-bold">Platform audit log</h1><p className="mt-2 text-slate-600">Immutable history of security and client configuration changes.</p>
  <form className="mt-6 grid gap-3 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
   <select name="business" defaultValue={business??""} className={field}><option value="">All businesses</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select>
   <select name="action" defaultValue={action??""} className={field}><option value="">All actions</option>{AUDIT_ACTIONS.map(x=><option key={x} value={x}>{actionLabel(x)}</option>)}</select>
   <input aria-label="From date" title="From date" type="date" name="from" defaultValue={query.from??""} className={field}/><input aria-label="To date" title="To date" type="date" name="to" defaultValue={query.to??""} className={field}/>
   <div className="flex gap-2"><button className="flex-1 rounded-xl bg-indigo-700 px-4 py-3 font-semibold text-white">Filter</button><Link href="/platform/audit" className="rounded-xl border px-4 py-3 font-semibold">Clear</Link></div>
  </form>
  {auditResult.error?<p role="alert" className="mt-6 rounded-xl bg-red-100 p-4 text-red-900">Unable to load audit history. Confirm migration 024 is applied.</p>:<section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
   <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-4">Date</th><th className="p-4">Business</th><th className="p-4">Action</th><th className="p-4">Actor</th><th className="p-4">Change details</th></tr></thead>
   <tbody>{entries.map(e=><tr key={e.id} className="border-b align-top"><td className="whitespace-nowrap p-4">{new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Colombo"}).format(new Date(e.occurred_at))}</td><td className="p-4">{e.business_name??"Deleted business"}</td><td className="p-4 font-semibold">{actionLabel(e.action)}</td><td className="max-w-52 break-all p-4">{e.actor_email??"System"}</td><td className="p-4"><details><summary className="cursor-pointer font-semibold text-indigo-700">View values</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 p-3 text-xs">Before{`\n`}{JSON.stringify(e.old_values,null,2)}</pre><pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 p-3 text-xs">After{`\n`}{JSON.stringify(e.new_values,null,2)}</pre></div></details></td></tr>)}</tbody></table></div>
   {entries.length===0&&<p className="p-8 text-center text-slate-600">No audit events match these filters.</p>}
   {entries.length===100&&<p className="border-t p-4 text-sm text-slate-600">Showing the latest 100 matching events.</p>}
  </section>}
 </div></main>;
}
