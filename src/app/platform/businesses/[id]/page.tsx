import { notFound } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platform/access";
import { UUID, logoUrl, type BusinessDetails } from "@/lib/branding";
import { BusinessForms } from "./business-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business Settings | InfoAxon Platform" };

export default async function BusinessSettings({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const client = await requirePlatformAccess();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const { data, error } = await client.rpc("platform_get_business", { p_id: id });
  if (!error && !data) notFound();
  const business = data as BusinessDetails | null;
  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a href="/platform" className="font-semibold text-indigo-700">← Back to businesses</a>
        <h1 className="mt-5 text-3xl font-bold">Business settings</h1>
        <p className="mt-2 text-slate-600">Contact details, account status and branding.</p>
        {query.saved && ["details", "logo", "removed"].includes(query.saved) && <p role="status" className="mt-5 rounded-xl bg-emerald-100 p-4 text-emerald-900">Changes saved. Client pages show the latest branding after refresh.</p>}
        {error || !business ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">Unable to load business settings. Confirm migration 019 completed successfully, then refresh.</p> :
          <BusinessForms key={business.updated_at} business={business} logo={logoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, business.logo_path)} />}
      </div>
    </main>
  );
}
