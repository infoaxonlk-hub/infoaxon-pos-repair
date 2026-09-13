"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { manageAdmin } from "./actions";
function Submit(){const {pending}=useFormStatus();return <button disabled={pending} className="rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">{pending?"Working…":"Confirm action"}</button>;}
export function AdminControls({business,id,active,updated}:{business:string;id:string;active:boolean;updated:string}) {
 const [operation,setOperation]=useState(active?"deactivate":"activate");
 return <form action={manageAdmin} className="mt-3 flex flex-wrap items-center gap-3">
  <input type="hidden" name="business" value={business}/><input type="hidden" name="target" value={id}/><input type="hidden" name="expected" value={updated}/>
  <select name="operation" value={operation} onChange={event=>setOperation(event.target.value)} aria-label="Admin action" className="rounded border p-2"><option value={active?"deactivate":"activate"}>{active?"Deactivate access":"Activate access"}</option><option value="set_password">Set temporary password</option>{active&&<option value="reset">Send password reset email</option>}</select>
  {operation==="set_password"&&<div className="grid w-full gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
   <label className="text-sm font-semibold">New temporary password<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" className="mt-2 w-full rounded border bg-white p-2 font-normal"/></label>
   <label className="text-sm font-semibold">Confirm password<input name="confirmation" type="password" minLength={12} maxLength={128} required autoComplete="new-password" className="mt-2 w-full rounded border bg-white p-2 font-normal"/></label>
   <p className="text-xs text-slate-600 sm:col-span-2">The old password is never displayed. This action does not activate an inactive account.</p>
  </div>}
  <label className="text-sm"><input type="checkbox" name="confirmed" value="yes" required/> I confirm this action for this admin</label><Submit/>
 </form>;
}
