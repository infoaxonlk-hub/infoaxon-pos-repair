"use client";
import {useActionState,useState} from "react";
import type {PlatformBranch} from "@/lib/branches";
import {saveBranch} from "./actions";
const empty={id:"",name:"",code:"",phone:"",address:"",active:true,is_main:false,updated_at:""};
export function BranchManager({business,branches}:{business:string;branches:PlatformBranch[]}){
 const [selected,setSelected]=useState(empty);const [state,action,pending]=useActionState(saveBranch,{error:""});
 const field="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3";
 const edit=(b:PlatformBranch)=>setSelected({id:b.id,name:b.name,code:b.code,phone:b.phone??"",address:b.address??"",active:b.active,is_main:b.is_main,updated_at:b.updated_at});
 return <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.05fr]">
  <section className="space-y-4">{branches.map(b=><article key={b.id} className="rounded-2xl bg-white p-5 shadow-sm">
   <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{b.name} {b.is_main&&<span className="rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-800">Main</span>}</h2><p className="mt-1 text-sm text-slate-600">{b.code} · {b.active?"Active":"Inactive"}</p></div><button type="button" onClick={()=>edit(b)} className="rounded-lg border px-3 py-2 font-semibold">Edit</button></div>
   <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><p><b>{b.staff_count}</b><br/>Active staff</p><p><b>{b.open_pos_sessions}</b><br/>Open POS</p><p><b>{b.open_repairs}</b><br/>Open repairs</p><p><b>{b.open_purchase_orders}</b><br/>Open POs</p></div>
  </article>)}</section>
  <form key={selected.id||"new"} action={action} className="h-fit rounded-2xl bg-white p-6 shadow-sm">
   <input type="hidden" name="business" value={business}/><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="expected" value={selected.updated_at}/>
   <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{selected.id?"Edit branch":"Add branch"}</h2>{selected.id&&<button type="button" onClick={()=>setSelected(empty)} className="text-sm font-semibold text-indigo-700">Add new</button>}</div>
   {state.error&&<p role="alert" className="mt-4 rounded-xl bg-red-100 p-4 text-red-900">{state.error}</p>}
   <label className="mt-5 block font-medium">Branch name<input name="name" required maxLength={100} defaultValue={selected.name} className={field}/></label>
   <label className="mt-4 block font-medium">Branch code<input name="code" required maxLength={20} defaultValue={selected.code} className={field}/></label>
   <label className="mt-4 block font-medium">Phone<input name="phone" maxLength={40} defaultValue={selected.phone} className={field}/></label>
   <label className="mt-4 block font-medium">Address<textarea name="address" maxLength={300} defaultValue={selected.address} className={field}/></label>
   <div className="mt-5 flex flex-wrap gap-5"><label className="flex gap-2"><input type="checkbox" name="active" value="yes" defaultChecked={selected.active}/>Active</label><label className="flex gap-2"><input type="checkbox" name="is_main" value="yes" defaultChecked={selected.is_main}/>Main branch</label></div>
   <label className="mt-5 flex gap-3 rounded-xl bg-amber-50 p-4 text-sm"><input type="checkbox" name="confirmed" value="yes"/>I confirm deactivation after staff and open work are cleared.</label>
   <button disabled={pending} className="mt-5 rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending?"Saving…":"Save branch"}</button>
  </form>
 </div>;
}
