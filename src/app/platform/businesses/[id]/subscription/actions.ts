"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platform/access";
import { UUID } from "@/lib/branding";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from "@/lib/subscriptions";

export type State={error:string};
const value=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function saveSubscription(_state:State,form:FormData):Promise<State>{
 const client=await requirePlatformAccess();
 const business=value(form,"business"),plan=value(form,"plan"),status=value(form,"status");
 const starts=value(form,"starts_on"),ends=value(form,"ends_on"),notes=value(form,"notes");
 const revision=Number(value(form,"revision")),monthly=Number(value(form,"monthly_fee"));
 const moduleFee=Number(value(form,"additional_module_fee"));
 if(!UUID.test(business)||!Number.isSafeInteger(revision)||revision<0||
   !SUBSCRIPTION_PLANS.includes(plan as never)||!SUBSCRIPTION_STATUSES.includes(status as never)||
   !/^\d{4}-\d{2}-\d{2}$/.test(starts)||(ends&&!/^\d{4}-\d{2}-\d{2}$/.test(ends))||
   (ends&&ends<starts)||!Number.isFinite(monthly)||monthly<0||!Number.isFinite(moduleFee)||moduleFee<0||notes.length>500)
   return {error:"Check the plan, status, dates and non-negative fees."};
 if(!["trial","active"].includes(status)&&form.get("confirmed")!=="yes")
   return {error:"Confirm that client access should be blocked."};
 const {error}=await client.rpc("platform_set_business_subscription",{
   p_business:business,p_expected_revision:revision,p_plan:plan,p_status:status,
   p_starts_on:starts,p_ends_on:ends||null,p_monthly_fee:monthly,
   p_additional_module_fee:moduleFee,p_notes:notes
 });
 if(error)return {error:error.code==="40001"?"Subscription changed in another tab. Refresh before saving.":"Could not save. Confirm migration 022 is applied."};
 revalidatePath("/platform");revalidatePath(`/platform/businesses/${business}/subscription`);
 redirect(`/platform/businesses/${business}/subscription?saved=1`);
}
