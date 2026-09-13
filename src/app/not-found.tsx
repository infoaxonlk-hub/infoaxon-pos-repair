import Link from "next/link";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 text-slate-900"><section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm"><p className="font-bold text-indigo-700">INFOAXON</p><h1 className="mt-3 text-3xl font-bold">Page not found</h1><p className="mt-3 text-slate-600">The page may have moved, or you may not have access to it.</p><Link href="/" className="mt-6 inline-block rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white">Return home</Link></section></main>;
}
