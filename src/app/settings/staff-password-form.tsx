"use client";

import { useState, type FormEvent } from "react";

export function StaffPasswordForm({staffId}:{staffId:string}){
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving)return;
  const form=event.currentTarget;const data=new FormData(form);
  const password=String(data.get("password")??"");const confirmation=String(data.get("confirmation")??"");
  setMessage("");setError("");
  if(password!==confirmation){setError("Passwords do not match.");return;}
  setSaving(true);
  try{
   const response=await fetch("/api/staff/password",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({target:staffId,password,confirmation})});
   const result=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(result?.error??"Password could not be updated.");
   form.reset();setMessage("Temporary password updated successfully. Share it privately with this staff member.");
  }catch(problem){setError(problem instanceof Error?problem.message:"Password could not be updated.");}
  finally{setSaving(false);}
 }
 const field="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3";
 return <form onSubmit={submit} className="mt-6 border-t pt-5">
  <h3 className="font-bold">Set temporary password</h3>
  <p className="mt-1 text-xs text-slate-500">The existing password is never displayed.</p>
  {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {message&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
  <label className="mt-4 block text-sm font-semibold">New password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={field}/></label>
  <label className="mt-4 block text-sm font-semibold">Confirm password<input name="confirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={field}/></label>
  <button disabled={saving} className="mt-4 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving?"Updating...":"Update Password"}</button>
 </form>;
}
