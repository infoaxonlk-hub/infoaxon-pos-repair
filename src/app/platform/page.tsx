import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/app/logout-button";

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

export default async function PlatformPage({ searchParams }: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { supabase, user } = await requireAdmin();
  const query = await searchParams;
  const { data, error } = await supabase.rpc("platform_list_businesses");
  const businesses = (data ?? []) as Business[];
  const messages: Record<string, string> = {
    invalid: "Name: 2–120 characters. Code: 2–30 letters, numbers, hyphens or underscores.",
    duplicate: "That business code already exists. Choose another code.",
    save: "Could not save. Check the client list before retrying.",
  };
  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bold text-indigo-700">INFOAXON</p>
            <h1 className="mt-2 text-3xl font-bold">Client Businesses</h1>
            <p className="mt-2 break-all text-sm text-slate-600">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/platform/admins/new" className="rounded-xl bg-indigo-700 px-4 py-3 font-semibold text-white">Create Client Admin</a>
            <LogoutButton />
          </div>
        </header>
        {query.error && <p role="alert" className="mt-6 rounded-xl bg-red-100 p-4 text-red-900">{messages[query.error] ?? messages.save}</p>}
        {query.created === "1" && !query.error && <p role="status" className="mt-6 rounded-xl bg-emerald-100 p-4 text-emerald-900">Business and Main Branch created. Client login setup is still pending.</p>}
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
          <p className="mt-2 text-sm text-slate-600">Use Manage for business details, logo and theme. Module selection is the next phase.</p>
          {error ? <p role="alert" className="mt-4 text-red-700">Could not load businesses. Confirm migration 018 was applied, then refresh.</p> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b"><th scope="col" className="p-3">Business</th><th scope="col" className="p-3">Code</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Settings</th></tr></thead>
                <tbody>{businesses.map((b) => <tr key={b.id} className="border-b"><td className="p-3">{b.name}</td><td className="p-3">{b.code}</td><td className="p-3">{b.active ? "Active" : "Inactive"}</td><td className="p-3"><a className="font-semibold text-indigo-700 underline" href={`/platform/businesses/${b.id}`} aria-label={`Manage ${b.name}`}>Manage</a></td></tr>)}</tbody>
              </table>
              {businesses.length === 0 && <p className="py-4 text-slate-600">No businesses yet.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
