"use client";
import {useActionState} from "react";
import {resetPassword} from "./actions";
export function ResetForm({token}:{token:string}) {
 const [state,action,pending]=useActionState(resetPassword,{message:"",done:false});
 return <form action={action} className="mt-5 grid gap-4"><input name="token" type="hidden" value={token}/>
 {!state.done&&<><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="mt-2 w-full rounded border p-3"/></label><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="mt-2 w-full rounded border p-3"/></label><button disabled={pending} className="rounded bg-indigo-700 p-3 text-white disabled:opacity-50">{pending?"Updating…":"Set new password"}</button></>}
 <p role="status">{state.message}</p></form>;
}
