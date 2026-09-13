import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(error:string,status:number){
 return NextResponse.json({error},{status,headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request){
 try{
  if(request.headers.get("sec-fetch-site")==="cross-site") return reply("Cross-site requests are not allowed.",403);
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json") return reply("JSON request required.",415);
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>4096) return reply("Request is too large.",413);
  let raw:unknown;
  try{raw=JSON.parse(text);}catch{return reply("Invalid JSON request.",400);}
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) return reply("Invalid password request.",400);
  const body=raw as Record<string,unknown>;
  const target=typeof body.target==="string"?body.target:"";
  const password=typeof body.password==="string"?body.password:"";
  const confirmation=typeof body.confirmation==="string"?body.confirmation:"";
  if(!uuid.test(target)||password.length<8||password.length>128||password!==confirmation) return reply("Enter matching passwords containing 8–128 characters.",400);

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!publicKey||!secret) return reply("Staff password service is not configured.",503);
  const jar=await cookies();
  const client=createServerClient(url,publicKey,{cookies:{getAll:()=>jar.getAll(),setAll:items=>items.forEach(({name,value,options})=>jar.set(name,value,options))}});
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError||!auth.user) return reply("Please sign in again.",401);
  const {data:actor,error:actorError}=await client.from("profiles").select("business_id,role,active").eq("id",auth.user.id).single();
  if(actorError||!actor||actor.role!=="admin"||actor.active!==true) return reply("Only active business administrators can reset staff passwords.",403);
  if(target===auth.user.id) return reply("Use the account recovery process to change your own password.",400);
  const {data:staff,error:staffError}=await client.from("profiles").select("id,role").eq("id",target).eq("business_id",actor.business_id).maybeSingle();
  if(staffError) return reply("Could not verify this staff account.",503);
  if(!staff||staff.role==="admin") return reply("Select a manager, cashier or technician in your business.",403);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {error}=await admin.auth.admin.updateUserById(target,{password});
  if(error) return reply(error.code==="weak_password"?"Choose a stronger password.":"Password could not be updated.",error.code==="weak_password"?400:503);
  return NextResponse.json({message:"Temporary password updated successfully."},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return reply("Staff password service is unavailable.",503);}
}
