"use client";
import { useFormStatus } from "react-dom";
import { manageAdmin } from "./actions";
function Submit(){const {pending}=useFormStatus();return <button disabled={pending} className="rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">{pending?"Working…":"Confirm action"}</button>;}
export function AdminControls({business,id,active,updated}:{business:string;id:string;active:boolean;updated:string}) {
 return <form action={manageAdmin} className="mt-3 flex flex-wrap items-center gap-3">
  <input type="hidden" name="business" value={business}/><input type="hidden" name="target" value={id}/><input type="hidden" name="expected" value={updated}/>
  <select name="operation" aria-label="Admin action" className="rounded border p-2"><option value={active?"deactivate":"activate"}>{active?"Deactivate access":"Activate access"}</option>{active&&<option value="reset">Send password reset email</option>}</select>
  <label className="text-sm"><input type="checkbox" name="confirmed" value="yes" required/> I confirm this action for this admin</label><Submit/>
 </form>;
}
