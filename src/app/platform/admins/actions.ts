"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requirePlatformAccess } from "@/lib/platform/access";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function manageAdmin(form: FormData) {
 const client=await requirePlatformAccess();
 const business=String(form.get("business")??"");
 const target=String(form.get("target")??"");
 const operation=String(form.get("operation")??"");
 if(!uuid.test(business)||!uuid.test(target)||form.get("confirmed")!=="yes") redirect("/platform/admins?result=invalid");
 let result="failed";
 if(operation==="activate"||operation==="deactivate") {
  const expected=String(form.get("expected")??"");
  if(!expected||!Number.isFinite(Date.parse(expected))) redirect("/platform/admins?result=invalid");
  const {error}=await client.rpc("platform_set_client_admin_active",{p_business:business,p_target:target,p_expected:expected,p_active:operation==="activate"});
  result=!error?"saved":error.code==="23514"?"last":error.code==="40001"?"stale":"failed";
 } else if(operation==="reset") {
  const origin=process.env.APP_ORIGIN;
  let valid=false;
  try {const url=new URL(origin??""); valid=url.protocol==="https:"&&url.origin===origin;} catch {}
  if(!valid||process.env.PASSWORD_RESET_EMAIL_READY!=="true") result="config";
  else {
   const {data:email,error}=await client.rpc("platform_request_client_admin_reset",{p_business:business,p_target:target});
   if(error||typeof email!=="string") result=error?.code==="P0001"?"wait":"failed";
   else {
    // Isolated public-key client: never changes the platform administrator's session.
    const sender=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    try {
     const {error:sendError}=await sender.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/reset-password`});
     result=sendError?"email_failed":"requested";
    } catch {result="email_failed";}
   }
  }
 }
 revalidatePath("/platform/admins");
 redirect(`/platform/admins?business=${encodeURIComponent(business)}&result=${result}`);
}
