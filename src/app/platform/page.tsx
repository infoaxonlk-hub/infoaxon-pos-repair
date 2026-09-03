import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/app/logout-button";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Platform Admin | InfoAxon",
};

export default async function PlatformPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: allowed, error } =
    await supabase.rpc("is_platform_admin");

  if (error) {
    throw new Error(
      "Unable to verify platform access. Please try again.",
    );
  }

  if (allowed !== true) notFound();

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-indigo-700">
              InfoAxon
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              Platform Admin
            </h1>
            <p className="mt-2 break-all text-sm text-slate-600">
              {user.email}
            </p>
          </div>
          <LogoutButton />
        </header>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Platform access is ready
          </h2>
          <p className="mt-3 text-slate-600">
            This is your separate platform workspace.
            Client management is not enabled yet.
          </p>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            "Client businesses",
            "Logos and theme colors",
            "Module selection",
          ].map((title) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Next phase
              </p>
              <h2 className="mt-2 font-semibold">{title}</h2>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}