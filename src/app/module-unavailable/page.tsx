import Link from "next/link";

export default function ModuleUnavailable() {
  return <main className="min-h-screen bg-slate-100 px-5 py-12 text-slate-900">
    <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Module not enabled</h1>
      <p className="mt-3 text-slate-600">Contact your platform administrator to enable this module. Historical transactions are retained for reporting.</p>
      <Link href="/" className="mt-6 inline-block font-semibold text-indigo-700">← Back to dashboard</Link>
    </section>
  </main>;
}
