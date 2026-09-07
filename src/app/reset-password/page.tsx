import {ResetForm} from "./reset-form";
export const dynamic="force-dynamic";
export const metadata={title:"Reset password | InfoAxon",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function ResetPage({searchParams}:{searchParams:Promise<{token_hash?:string}>}) {
 const query=await searchParams;const token=typeof query.token_hash==="string"?query.token_hash:"";
 return <main className="min-h-screen bg-slate-100 p-6 text-slate-900"><section className="mx-auto mt-12 max-w-lg rounded-xl bg-white p-6 shadow"><h1 className="text-2xl font-bold">Reset your password</h1><p className="mt-3">Only continue if you requested this reset. This link can be used once. Do not share it.</p>{/^[a-f0-9]{32,256}$/i.test(token)?<ResetForm token={token}/>:<p className="my-4">Open the recovery link in your reset email. Ask your administrator for a new link if needed.</p>}<a href="/login" className="text-indigo-700 underline">Return to login</a></section></main>;
}
