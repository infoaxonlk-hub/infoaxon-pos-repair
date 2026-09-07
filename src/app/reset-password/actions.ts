"use server";
import {createClient} from "@supabase/supabase-js";
export async function resetPassword(_state:{message:string;done:boolean},form:FormData) {
 const token=String(form.get("token")??"");const password=String(form.get("password")??"");
 if(!/^[a-f0-9]{32,256}$/i.test(token)||password.length<12||password.length>128||password!==form.get("confirm")) return {message:"Use matching passwords of 12–128 characters and a valid recovery link.",done:false};
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try {
  const {error}=await client.auth.verifyOtp({token_hash:token,type:"recovery"});
  if(error) return {message:"This link is invalid, expired or already used. Ask your administrator for a new reset email.",done:false};
  const {error:updateError}=await client.auth.updateUser({password});
  if(updateError) return {message:"Password was not updated. It may not meet the password policy. Ask for a new reset email and try a stronger password.",done:false};
  await client.auth.signOut({scope:"global"});
  return {message:"Password updated. You can now return to login. Inactive accounts still need administrator activation.",done:true};
 } catch {return {message:"Unable to complete reset. Try logging in with your new password before requesting another link.",done:false};}
}
