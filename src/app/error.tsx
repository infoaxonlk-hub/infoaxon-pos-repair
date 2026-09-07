"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 text-slate-900"><section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm"><p className="font-bold text-indigo-700">INFOAXON</p><h1 className="mt-3 text-3xl font-bold">We could not load this page</h1><p className="mt-3 text-slate-600">The problem may be temporary. Try again, or return to the dashboard.</p>{error.digest && <p className="mt-3 text-xs text-slate-500">Support reference: {error.digest}</p>}<div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={() => retry()} className="rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white">Try again</button><Link href="/" className="rounded-xl border border-indigo-700 px-5 py-3 font-semibold text-indigo-700">Return home</Link></div></section></main>;
}
