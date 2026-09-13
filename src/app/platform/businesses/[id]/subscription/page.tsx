import {notFound} from "next/navigation";
import Link from "next/link";
import {requirePlatformAccess} from "@/lib/platform/access";
import {UUID} from "@/lib/branding";
import type {Subscription} from "@/lib/subscriptions";
import {SubscriptionForm} from "./subscription-form";
export const dynamic="force-dynamic";
export const metadata={title:"Subscription | InfoAxon Platform"};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){
 const {id}=await params;if(!UUID.test(id))notFound();const client=await requirePlatformAccess();
 const query=await searchParams;const {data,error}=await client.rpc("platform_get_business_subscription",{p_business:id});
 if(!error&&!data)notFound();
 return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900"><div className="mx-auto max-w-4xl">
  <Link href={`/platform/businesses/${id}`} className="font-semibold text-indigo-700">← Business settings</Link>
  <h1 className="mt-5 text-3xl font-bold">Subscription and licence</h1>
  <p className="mt-2 text-slate-600">Manage access dates and commercial terms. Existing data is retained when access is blocked.</p>
  {query.saved==="1"&&<p role="status" className="mt-5 rounded-xl bg-emerald-100 p-4 text-emerald-900">Subscription saved.</p>}
  {error||!data?<p role="alert" className="mt-5 rounded-xl bg-red-100 p-4 text-red-900">Unable to load. Confirm migration 022 is applied.</p>:<SubscriptionForm subscription={data as Subscription}/>} 
 </div></main>;
}
