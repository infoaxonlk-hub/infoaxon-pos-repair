"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requirePlatformAccess} from "@/lib/platform/access";
import {UUID} from "@/lib/branding";
export type State={error:string};
const value=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function saveBranch(_state:State,form:FormData):Promise<State>{
 const client=await requirePlatformAccess();
 const business=value(form,"business"),id=value(form,"id"),expected=value(form,"expected");
 const name=value(form,"name"),code=value(form,"code").toUpperCase();
 const phone=value(form,"phone"),address=value(form,"address");
 const active=form.get("active")==="yes",main=form.get("is_main")==="yes";
 if(!UUID.test(business)||(id&&!UUID.test(id))||name.length<2||name.length>100||
   !/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)||phone.length>40||address.length>300)
   return {error:"Check the branch name, code, phone and address."};
 if(!active&&form.get("confirmed")!=="yes")return {error:"Confirm that this branch should be deactivated."};
 const {error}=await client.rpc("platform_save_business_branch",{
  p_business:business,p_id:id||null,p_expected_updated_at:expected||null,
  p_name:name,p_code:code,p_phone:phone,p_address:address,p_active:active,p_is_main:main
 });
 if(error){
  const known:Record<string,string>={"40001":"Branch changed in another tab. Refresh before saving.","23505":"This branch code is already in use.","23514":error.message};
  return {error:known[error.code]??"Could not save branch. Confirm migration 023 is applied."};
 }
 revalidatePath(`/platform/businesses/${business}/branches`);
 redirect(`/platform/businesses/${business}/branches?saved=1`);
}
