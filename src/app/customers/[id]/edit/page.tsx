"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Save, UserRound } from "lucide-react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CustomerForm = { code: string; customer_type: string; name: string; company_name: string; phone: string; alternate_phone: string; email: string; nic: string; tax_number: string; address: string; city: string; credit_limit: number; opening_balance: number; notes: string; active: boolean };
const empty: CustomerForm = { code: "", customer_type: "individual", name: "", company_name: "", phone: "", alternate_phone: "", email: "", nic: "", tax_number: "", address: "", city: "", credit_limit: 0, opening_balance: 0, notes: "", active: true };

export default function EditCustomerPage() {
  const params = useParams(); const customerId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [customer, setCustomer] = useState<CustomerForm>(empty); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => { async function load() { const supabase = createClient(); const { data, error: loadError } = await supabase.from("customers").select("code, customer_type, name, company_name, phone, alternate_phone, email, nic, tax_number, address, city, credit_limit, opening_balance, notes, active").eq("id", customerId).single();
    if (loadError || !data) { setError(loadError?.message || "Customer could not be found."); setLoading(false); return; }
    setCustomer({ code: data.code, customer_type: data.customer_type, name: data.name, company_name: data.company_name || "", phone: data.phone, alternate_phone: data.alternate_phone || "", email: data.email || "", nic: data.nic || "", tax_number: data.tax_number || "", address: data.address || "", city: data.city || "", credit_limit: Number(data.credit_limit), opening_balance: Number(data.opening_balance), notes: data.notes || "", active: data.active }); setLoading(false); }
    if (customerId) load(); }, [customerId]);
  function update<K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) { setCustomer((current) => ({ ...current, [key]: value })); }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); const supabase = createClient(); const { error: updateError } = await supabase.from("customers").update({ ...customer, code: customer.code.trim().toUpperCase(), name: customer.name.trim(), company_name: customer.company_name.trim() || null, phone: customer.phone.trim(), alternate_phone: customer.alternate_phone.trim() || null, email: customer.email.trim() || null, nic: customer.nic.trim() || null, tax_number: customer.tax_number.trim() || null, address: customer.address.trim() || null, city: customer.city.trim() || null, notes: customer.notes.trim() || null }).eq("id", customerId); if (updateError) { setError(updateError.message); setSaving(false); return; } window.location.href = "/customers"; }
  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50"><p className="font-semibold text-slate-500">Loading customer...</p></main>;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-4xl">
    <Link href="/customers" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft size={18}/>Back to Customers</Link>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center gap-4 border-b p-6"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><UserRound size={26}/></div><div><h1 className="text-2xl font-bold">Edit Customer</h1><p className="text-slate-500">Update customer information and status.</p></div></header>
      <form onSubmit={handleSubmit} className="space-y-8 p-6">{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="text-sm font-semibold">Customer code *<input required value={customer.code} onChange={(e) => update("code", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">Customer type<select value={customer.customer_type} onChange={(e) => update("customer_type", e.target.value)} className={input}><option value="individual">Individual</option><option value="business">Business</option></select></label>
          <label className="text-sm font-semibold">Customer name *<input required value={customer.name} onChange={(e) => update("name", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">Company name<input value={customer.company_name} onChange={(e) => update("company_name", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">Primary phone *<input required value={customer.phone} onChange={(e) => update("phone", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">Alternate phone<input value={customer.alternate_phone} onChange={(e) => update("alternate_phone", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">Email<input type="email" value={customer.email} onChange={(e) => update("email", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">NIC / Registration no.<input value={customer.nic} onChange={(e) => update("nic", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold sm:col-span-2">Tax number<input value={customer.tax_number} onChange={(e) => update("tax_number", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold sm:col-span-2">Address<textarea rows={3} value={customer.address} onChange={(e) => update("address", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">City<input value={customer.city} onChange={(e) => update("city", e.target.value)} className={input}/></label>
          <label className="text-sm font-semibold">Credit limit<input type="number" min="0" step="0.01" value={customer.credit_limit} onChange={(e) => update("credit_limit", Number(e.target.value))} className={input}/></label>
          <label className="text-sm font-semibold">Opening balance<input type="number" step="0.01" value={customer.opening_balance} onChange={(e) => update("opening_balance", Number(e.target.value))} className={input}/></label>
          <label className="text-sm font-semibold">Status<select value={customer.active ? "active" : "inactive"} onChange={(e) => update("active", e.target.value === "active")} className={input}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label className="text-sm font-semibold sm:col-span-2">Internal notes<textarea rows={3} value={customer.notes} onChange={(e) => update("notes", e.target.value)} className={input}/></label>
        </div>
        <div className="flex justify-end gap-3 border-t pt-6"><Link href="/customers" className="rounded-xl border px-5 py-3 font-semibold">Cancel</Link><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"><Save size={18}/>{saving ? "Saving..." : "Save Changes"}</button></div>
      </form></section>
  </div></main>;
}
