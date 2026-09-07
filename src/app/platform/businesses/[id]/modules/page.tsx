import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platform/access";
import { UUID } from "@/lib/branding";
import { isModuleList } from "@/lib/modules";
import { ModuleForm } from "./module-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business Modules | InfoAxon Platform" };

export default async function ModulesPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const client = await requirePlatformAccess();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const { data, error } = await client.rpc("platform_get_business_modules", { p_id: id });
  if (!error && !data) notFound();
  const valid = data && isModuleList(data.modules) && Number.isSafeInteger(data.revision);
  return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
    <div className="mx-auto max-w-4xl">
      <Link href={`/platform/businesses/${id}`} className="font-semibold text-indigo-700">← Back to business settings</Link>
      <h1 className="mt-5 text-3xl font-bold">Business modules</h1>
      {!error && valid && <p className="mt-2 text-slate-600">{data.name}</p>}
      {query.saved === "1" && !error && valid && <p role="status" className="mt-5 rounded-xl bg-emerald-100 p-4 text-emerald-900">Modules saved. Clients see menu changes after refresh; new operations use the latest access rules.</p>}
      {error || !valid ? <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">Unable to load modules. Confirm migration 020 completed, then refresh.</p>
        : <ModuleForm key={data.revision} id={id} revision={data.revision} enabled={data.modules} />}
    </div>
  </main>;
}
