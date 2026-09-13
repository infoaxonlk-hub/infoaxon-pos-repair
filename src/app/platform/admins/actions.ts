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
 } else if(operation==="set_password") {
  const password=String(form.get("password")??"");
  const confirmation=String(form.get("confirmation")??"");
  if(password.length<12||password.length>128||password!==confirmation) result="password_invalid";
  else {
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
   const secret=process.env.SUPABASE_SECRET_KEY;
   if(!url||!secret) result="config";
   else {
    const [{data:businesses,error:businessError},{data:admins,error:adminError}]=await Promise.all([
     client.rpc("platform_list_businesses"),
     client.rpc("platform_list_client_admins",{p_business:business}),
    ]);
    const businessAllowed=!businessError&&Array.isArray(businesses)&&businesses.some((item:unknown)=>{
     const row=item as {id?:unknown};return row.id===business;
    });
    const targetAllowed=!adminError&&Array.isArray(admins)&&admins.some((item:unknown)=>{
     const row=item as {id?:unknown};return row.id===target;
    });
    if(!businessAllowed||!targetAllowed) result="invalid";
    else {
     const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
     const {error}=await admin.auth.admin.updateUserById(target,{password});
     result=error?error.code==="weak_password"?"password_invalid":"password_failed":"password_saved";
    }
   }
  }
 }
 revalidatePath("/platform/admins");
 redirect(`/platform/admins?business=${encodeURIComponent(business)}&result=${result}`);
}
