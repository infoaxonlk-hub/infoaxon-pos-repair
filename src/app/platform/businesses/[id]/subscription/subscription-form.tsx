"use client";
import {useActionState} from "react";
import {saveSubscription} from "./actions";
import {SUBSCRIPTION_PLANS,SUBSCRIPTION_STATUSES,type Subscription} from "@/lib/subscriptions";
export function SubscriptionForm({subscription:s}:{subscription:Subscription}){
 const [state,action,pending]=useActionState(saveSubscription,{error:""});
 const field="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3";
 return <form action={action} className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <input type="hidden" name="business" value={s.business_id}/><input type="hidden" name="revision" value={s.revision}/>
  {state.error&&<p role="alert" className="mb-5 rounded-xl bg-red-100 p-4 text-red-900">{state.error}</p>}
  <div className="grid gap-5 sm:grid-cols-2">
   <label className="font-medium">Plan<select name="plan" defaultValue={s.plan} className={field}>{SUBSCRIPTION_PLANS.map(x=><option key={x} value={x}>{x.replace("_"," ")}</option>)}</select></label>
   <label className="font-medium">Status<select name="status" defaultValue={s.status} className={field}>{SUBSCRIPTION_STATUSES.map(x=><option key={x} value={x}>{x.replace("_"," ")}</option>)}</select></label>
   <label className="font-medium">Start date<input type="date" name="starts_on" required defaultValue={s.starts_on} className={field}/></label>
   <label className="font-medium">End date (optional)<input type="date" name="ends_on" defaultValue={s.ends_on??""} className={field}/></label>
   <label className="font-medium">Monthly fee (LKR)<input type="number" name="monthly_fee" min="0" step="0.01" required defaultValue={s.monthly_fee} className={field}/></label>
   <label className="font-medium">Additional module fee (LKR)<input type="number" name="additional_module_fee" min="0" step="0.01" required defaultValue={s.additional_module_fee} className={field}/></label>
   <label className="font-medium sm:col-span-2">Internal notes<textarea name="notes" maxLength={500} defaultValue={s.notes??""} className={field}/></label>
  </div>
  <label className="mt-5 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm"><input type="checkbox" name="confirmed" value="yes" className="mt-1"/>I confirm any non-active status will block this client from the business system.</label>
  <button disabled={pending} className="mt-5 rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending?"Saving…":"Save subscription"}</button>
 </form>;
}
