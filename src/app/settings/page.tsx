"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Building2, Pencil, Save, Settings, Store, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Business = { id:string; name:string; phone:string|null; email:string|null; address:string|null; currency_code:string; timezone:string };
type Branch = { id:string; name:string; code:string; phone:string|null; address:string|null; active:boolean };
type Staff = { id:string; full_name:string; role:"admin"|"manager"|"cashier"|"technician"; branch_id:string|null; phone:string|null; active:boolean };

export default function SettingsPage() {
  const [tab,setTab]=useState<"business"|"branches"|"staff">("business");
  const [business,setBusiness]=useState<Business|null>(null);
  const [branches,setBranches]=useState<Branch[]>([]);
  const [staff,setStaff]=useState<Staff[]>([]);
  const [role,setRole]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [branchForm,setBranchForm]=useState<Partial<Branch>>({name:"",code:"",phone:"",address:"",active:true});
  const [staffForm,setStaffForm]=useState<Staff|null>(null);

  async function load() {
    setLoading(true); setError("");
    const s=createClient(); const {data:a}=await s.auth.getUser();
    if(!a.user){window.location.href="/login";return;}
    const {data:p,error:pe}=await s.from("profiles").select("business_id,role").eq("id",a.user.id).single();
    if(pe||!p){setError(pe?.message||"Profile not found");setLoading(false);return;}
    setRole(p.role);
    const [b,br,st]=await Promise.all([
      s.from("businesses").select("id,name,phone,email,address,currency_code,timezone").eq("id",p.business_id).single(),
      s.from("branches").select("id,name,code,phone,address,active").eq("business_id",p.business_id).order("name"),
      s.from("profiles").select("id,full_name,role,branch_id,phone,active").eq("business_id",p.business_id).order("full_name")
    ]);
    if(b.error||br.error||st.error)setError(b.error?.message||br.error?.message||st.error?.message||"Could not load settings");
    else {setBusiness(b.data as Business);setBranches((br.data||[]) as Branch[]);setStaff((st.data||[]) as Staff[]);}
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);

  async function saveBusiness(e:FormEvent){e.preventDefault();if(!business)return;setSaving(true);setError("");setMessage("");
    const {error:x}=await createClient().rpc("update_business_settings",{p_name:business.name,p_phone:business.phone,p_email:business.email,p_address:business.address,p_currency_code:business.currency_code,p_timezone:business.timezone});
    if(x)setError(x.message);else setMessage("Business settings saved successfully.");setSaving(false);
  }
  async function saveBranch(e:FormEvent){e.preventDefault();setSaving(true);setError("");setMessage("");
    const {error:x}=await createClient().rpc("save_branch",{p_id:branchForm.id||null,p_name:branchForm.name||"",p_code:branchForm.code||"",p_phone:branchForm.phone||null,p_address:branchForm.address||null,p_active:branchForm.active??true});
    if(x)setError(x.message);else{setMessage("Branch saved successfully.");setBranchForm({name:"",code:"",phone:"",address:"",active:true});await load();}setSaving(false);
  }
  async function saveStaff(e:FormEvent){e.preventDefault();if(!staffForm)return;setSaving(true);setError("");setMessage("");
    const {error:x}=await createClient().rpc("update_staff_profile",{p_user_id:staffForm.id,p_full_name:staffForm.full_name,p_role:staffForm.role,p_branch_id:staffForm.branch_id||null,p_phone:staffForm.phone||null,p_active:staffForm.active});
    if(x)setError(x.message);else{setMessage("Staff profile updated successfully.");setStaffForm(null);await load();}setSaving(false);
  }
  const field="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500";
  if(loading)return <main className="min-h-screen bg-slate-50 p-10 text-slate-500">Loading settings...</main>;

  return <main className="min-h-screen bg-slate-50 p-5 md:p-8"><div className="mx-auto max-w-6xl">
    <Link href="/" className="inline-flex items-center gap-2 font-semibold text-blue-700"><ArrowLeft size={18}/>Back to Dashboard</Link>
    <div className="mt-5"><h1 className="flex items-center gap-3 text-3xl font-bold"><Settings className="text-blue-600"/>Settings</h1><p className="mt-1 text-slate-600">Business, branch and staff configuration.</p></div>
    {role!=="admin"&&<div className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-800">Only administrators can change these settings.</div>}
    {error&&<div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}{message&&<div className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-700">{message}</div>}
    <div className="mt-6 flex flex-wrap gap-2">{[
      ["business","Business",Building2],["branches","Branches",Store],["staff","Staff",Users]
    ].map(([key,label,Icon])=>{const I=Icon as typeof Building2;return <button key={String(key)} onClick={()=>setTab(key as typeof tab)} className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold ${tab===key?"bg-blue-600 text-white":"border bg-white"}`}><I size={18}/>{String(label)}</button>})}</div>

    {tab==="business"&&business&&<form onSubmit={saveBusiness} className="mt-5 grid gap-5 rounded-2xl border bg-white p-6 shadow-sm md:grid-cols-2">
      <label className="font-semibold">Business Name *<input className={field} value={business.name} onChange={e=>setBusiness({...business,name:e.target.value})} required/></label>
      <label className="font-semibold">Phone<input className={field} value={business.phone||""} onChange={e=>setBusiness({...business,phone:e.target.value})}/></label>
      <label className="font-semibold">Email<input type="email" className={field} value={business.email||""} onChange={e=>setBusiness({...business,email:e.target.value})}/></label>
      <label className="font-semibold">Currency<input className={field} value={business.currency_code} onChange={e=>setBusiness({...business,currency_code:e.target.value})}/></label>
      <label className="font-semibold">Timezone<input className={field} value={business.timezone} onChange={e=>setBusiness({...business,timezone:e.target.value})}/></label>
      <label className="font-semibold md:col-span-2">Address<textarea className={field} value={business.address||""} onChange={e=>setBusiness({...business,address:e.target.value})}/></label>
      <button disabled={saving||role!=="admin"} className="inline-flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"><Save size={18}/>{saving?"Saving...":"Save Business"}</button>
    </form>}

    {tab==="branches"&&<div className="mt-5 grid gap-5 lg:grid-cols-2"><form onSubmit={saveBranch} className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">{branchForm.id?"Edit Branch":"Add Branch"}</h2>
      <label className="mt-5 block font-semibold">Name *<input className={field} value={branchForm.name||""} onChange={e=>setBranchForm({...branchForm,name:e.target.value})} required/></label>
      <label className="mt-4 block font-semibold">Code *<input className={field} value={branchForm.code||""} onChange={e=>setBranchForm({...branchForm,code:e.target.value})} required/></label>
      <label className="mt-4 block font-semibold">Phone<input className={field} value={branchForm.phone||""} onChange={e=>setBranchForm({...branchForm,phone:e.target.value})}/></label>
      <label className="mt-4 block font-semibold">Address<textarea className={field} value={branchForm.address||""} onChange={e=>setBranchForm({...branchForm,address:e.target.value})}/></label>
      <label className="mt-4 flex items-center gap-2"><input type="checkbox" checked={branchForm.active??true} onChange={e=>setBranchForm({...branchForm,active:e.target.checked})}/> Active</label>
      <button disabled={saving||role!=="admin"} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">Save Branch</button>
    </form><section className="space-y-3">{branches.map(b=><article key={b.id} className="flex items-center justify-between rounded-2xl border bg-white p-5 shadow-sm"><div><h3 className="font-bold">{b.name}</h3><p className="text-sm text-slate-500">{b.code} · {b.active?"Active":"Inactive"}</p></div><button onClick={()=>setBranchForm(b)} className="rounded-lg border p-2"><Pencil size={18}/></button></article>)}</section></div>}
{tab === "staff" && role === "admin" && (
  <div className="mt-5 flex justify-end">
    <Link
      href="/settings/staff/new"
      className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
    >
      + Add Staff
    </Link>
  </div>
)}
    {tab==="staff"&&<div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="space-y-3">{staff.map(u=><article key={u.id} className="flex items-center justify-between rounded-2xl border bg-white p-5 shadow-sm"><div><h3 className="font-bold">{u.full_name}</h3><p className="text-sm capitalize text-slate-500">{u.role} · {u.active?"Active":"Inactive"}</p></div><button onClick={()=>setStaffForm(u)} className="rounded-lg border p-2"><Pencil size={18}/></button></article>)}</section>
      {staffForm?<form onSubmit={saveStaff} className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Edit Staff</h2>
        <label className="mt-5 block font-semibold">Full Name<input className={field} value={staffForm.full_name} onChange={e=>setStaffForm({...staffForm,full_name:e.target.value})}/></label>
        <label className="mt-4 block font-semibold">Role<select className={field} value={staffForm.role} onChange={e=>setStaffForm({...staffForm,role:e.target.value as Staff["role"]})}>{["admin","manager","cashier","technician"].map(r=><option key={r} value={r}>{r}</option>)}</select></label>
        <label className="mt-4 block font-semibold">Branch<select className={field} value={staffForm.branch_id||""} onChange={e=>setStaffForm({...staffForm,branch_id:e.target.value||null})}><option value="">All branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="mt-4 block font-semibold">Phone<input className={field} value={staffForm.phone||""} onChange={e=>setStaffForm({...staffForm,phone:e.target.value})}/></label>
        <label className="mt-4 flex items-center gap-2"><input type="checkbox" checked={staffForm.active} onChange={e=>setStaffForm({...staffForm,active:e.target.checked})}/> Active</label>
        <button disabled={saving||role!=="admin"} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">Update Staff</button>
      </form>:<div className="rounded-2xl border bg-white p-10 text-center text-slate-500">Select a staff member to edit.<p className="mt-2 text-xs">New login accounts are created from Supabase Authentication first.</p></div>}</div>}
  </div></main>;
}
