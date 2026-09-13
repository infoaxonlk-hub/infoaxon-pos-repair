export default function PlatformLoading() {
  return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900"><div className="mx-auto max-w-7xl" role="status" aria-live="polite"><div className="h-8 w-64 animate-pulse rounded bg-slate-300"/><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 },(_,index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-white shadow-sm"/>)}</div><p className="mt-5 text-sm text-slate-600">Loading platform data…</p></div></main>;
}
