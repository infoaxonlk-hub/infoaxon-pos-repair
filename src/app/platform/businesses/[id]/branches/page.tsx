import Link from "next/link";
import {notFound} from "next/navigation";
import {requirePlatformAccess} from "@/lib/platform/access";
import {UUID} from "@/lib/branding";
import type {PlatformBranch} from "@/lib/branches";
import {BranchManager} from "./branch-manager";
export const dynamic="force-dynamic";
export const metadata={title:"Branches | InfoAxon Platform"};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){
 const {id}=await params;if(!UUID.test(id))notFound();const client=await requirePlatformAccess();const query=await searchParams;
 const [{data:business,error:businessError},{data,error}]=await Promise.all([client.rpc("platform_get_business",{p_id:id}),client.rpc("platform_list_business_branches",{p_business:id})]);
 if(!businessError&&!business)notFound();
 return <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900"><div className="mx-auto max-w-6xl">
  <Link href={`/platform/businesses/${id}`} className="font-semibold text-indigo-700">← Business settings</Link><h1 className="mt-5 text-3xl font-bold">Branch management</h1>
  <p className="mt-2 text-slate-600">{business?.name??"Business"} · Main branch, locations and operational readiness.</p>
  {query.saved==="1"&&<p role="status" className="mt-5 rounded-xl bg-emerald-100 p-4 text-emerald-900">Branch saved.</p>}
  {error?<p role="alert" className="mt-5 rounded-xl bg-red-100 p-4 text-red-900">Unable to load. Confirm migration 023 is applied.</p>:<BranchManager business={id} branches={(data??[]) as PlatformBranch[]}/>} 
 </div></main>;
}
