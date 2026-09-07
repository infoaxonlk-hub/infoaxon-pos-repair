import Link from "next/link";
import { requirePlatformAccess } from "@/lib/platform/access";
import { AdminControls } from "./admin-controls";
import { SwitchAccountButton } from "@/app/switch-account-button";
export const dynamic="force-dynamic";
export const metadata={title:"Client Admins | InfoAxon"};
const messages:Record<string,string>={saved:"Admin access updated.",requested:"Reset email request accepted. Delivery is not confirmed; ask the client to check their inbox and spam folder.",invalid:"Select a valid admin and confirm the action.",failed:"Action failed. Refresh and check the current status before retrying.",last:"Keep at least one active administrator. Create or activate another admin first.",stale:"This admin changed. Refresh and try again.",config:"Password reset email setup is not ready. Follow CLIENT-ADMINS-SETUP.md.",wait:"Wait at least 60 seconds before requesting another reset.",email_failed:"Email could not be requested. Check Supabase email settings and limits, then wait 60 seconds before retrying."};
type Admin={id:string;full_name:string;email:string;active:boolean;updated_at:string};
export default async function Admins({searchParams}:{searchParams:Promise<{business?:string;result?:string}>}) {
 const client=await requirePlatformAccess();const query=await searchParams;
 const {data:businesses,error}=await client.rpc("platform_list_businesses");
 const list=(businesses??[]) as {id:string;name:string;active:boolean}[];
 const business=list.find(b=>b.id===query.business);
 const admins=business?await client.rpc("platform_list_client_admins",{p_business:business.id}):null;
 return <main className="min-h-screen bg-slate-100 p-6 text-slate-900"><div className="mx-auto max-w-5xl">
 <Link href="/platform" className="text-indigo-700">← Businesses</Link><h1 className="my-5 text-3xl font-bold">Client administrators</h1>
 <Link href="/platform/admins/new" className="text-indigo-700 underline">Create Client Admin</Link>
 <p className="my-4">Deactivation blocks subsequent protected requests, not deletion of data. The last active admin cannot be deactivated. Password resets never reactivate an account.</p>
 {query.result&&<p role="status" className="my-4 rounded bg-white p-4">{messages[query.result]??messages.failed}</p>}
 {error?<p role="alert">Could not load businesses. Refresh to retry.</p>:<form className="my-5 flex gap-3"><select name="business" defaultValue={business?.id??""} required aria-label="Business" className="max-w-full rounded border p-3"><option value="">Select business</option>{list.map(b=><option key={b.id} value={b.id}>{b.name}{b.active?"":" (inactive business)"}</option>)}</select><button className="rounded bg-indigo-700 px-4 text-white">Show admins</button></form>}
 {admins?.error?<p role="alert">Could not load admins. Confirm migration 021 is applied.</p>:business&&<section><h2 className="text-xl font-semibold">{business.name}</h2><p className="mt-2 text-sm text-slate-600">Choose an administrator below to leave the platform workspace and open the client login with the correct email already filled.</p>{((admins?.data??[]) as Admin[]).map(a=><article key={a.id} className="my-4 rounded-xl bg-white p-5 shadow-sm"><h3 className="font-bold">{a.full_name} — {a.active?"Active":"Inactive"}</h3><p className="break-all">{a.email}</p>{a.active&&<SwitchAccountButton email={a.email} business={business.name}/>}<AdminControls business={business.id} id={a.id} active={a.active} updated={a.updated_at}/></article>)}{!admins?.data?.length&&<p className="my-4">No client admins in this business.</p>}</section>}
 </div></main>;
}
