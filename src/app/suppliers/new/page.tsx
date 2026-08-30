"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Save, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewSupplierPage() {
  const router = useRouter(); const [saving,setSaving] = useState(false); const [error,setError] = useState("");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("business_id").eq("id", user.id).single(); if (!profile) { setError("Your business profile could not be found."); setSaving(false); return; }
    const text = (name:string) => String(form.get(name) ?? "").trim();
    const { error: insertError } = await supabase.from("suppliers").insert({
      business_id: profile.business_id, code: text("code").toUpperCase(), supplier_type: text("supplier_type"), name: text("name"), company_name: text("company_name") || null,
      phone: text("phone"), alternate_phone: text("alternate_phone") || null, email: text("email") || null, nic_or_registration: text("nic_or_registration") || null, tax_number: text("tax_number") || null,
      address: text("address") || null, city: text("city") || null, bank_name: text("bank_name") || null, bank_branch: text("bank_branch") || null, account_name: text("account_name") || null, account_number: text("account_number") || null,
      payment_terms_days: Number(form.get("payment_terms_days") || 0), opening_balance: Number(form.get("opening_balance") || 0), notes: text("notes") || null, active: true,
    });
    if (insertError) { setError(insertError.message); setSaving(false); return; } window.location.href = "/suppliers";
  }
  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-4xl"><Link href="/suppliers" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft size={18}/>Back to Suppliers</Link><section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><header className="flex items-center gap-4 border-b p-6"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Truck size={26}/></div><div><h1 className="text-2xl font-bold">New Supplier</h1><p className="text-slate-500">Create an individual or business supplier.</p></div></header>
    <form onSubmit={handleSubmit} className="space-y-8 p-6">{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div><h2 className="mb-4 font-bold">Basic information</h2><div className="grid gap-6 sm:grid-cols-2">
        <label className="text-sm font-semibold">Supplier code *<input name="code" required placeholder="Example: SUP-0001" className={input}/></label><label className="text-sm font-semibold">Supplier type *<select name="supplier_type" defaultValue="business" className={input}><option value="business">Business</option><option value="individual">Individual</option></select></label>
        <label className="text-sm font-semibold">Contact person / name *<input name="name" required className={input}/></label><label className="text-sm font-semibold">Company name<input name="company_name" className={input}/></label>
        <label className="text-sm font-semibold">Primary phone *<input name="phone" required className={input}/></label><label className="text-sm font-semibold">Alternate phone<input name="alternate_phone" className={input}/></label>
        <label className="text-sm font-semibold">Email<input name="email" type="email" className={input}/></label><label className="text-sm font-semibold">NIC / Registration no.<input name="nic_or_registration" className={input}/></label><label className="text-sm font-semibold sm:col-span-2">Tax number<input name="tax_number" placeholder="VAT/TIN (optional)" className={input}/></label>
      </div></div>
      <div><h2 className="mb-4 font-bold">Address and account</h2><div className="grid gap-6 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Address<textarea name="address" rows={3} className={input}/></label><label className="text-sm font-semibold">City<input name="city" className={input}/></label><label className="text-sm font-semibold">Payment terms (days)<input name="payment_terms_days" type="number" min="0" defaultValue="0" className={input}/></label><label className="text-sm font-semibold">Opening payable balance<input name="opening_balance" type="number" min="0" step="0.01" defaultValue="0" className={input}/></label></div></div>
      <div><h2 className="mb-4 font-bold">Bank details</h2><div className="grid gap-6 sm:grid-cols-2"><label className="text-sm font-semibold">Bank name<input name="bank_name" className={input}/></label><label className="text-sm font-semibold">Branch<input name="bank_branch" className={input}/></label><label className="text-sm font-semibold">Account name<input name="account_name" className={input}/></label><label className="text-sm font-semibold">Account number<input name="account_number" className={input}/></label><label className="text-sm font-semibold sm:col-span-2">Internal notes<textarea name="notes" rows={3} className={input}/></label></div></div>
      <div className="flex justify-end gap-3 border-t pt-6"><Link href="/suppliers" className="rounded-xl border px-5 py-3 font-semibold">Cancel</Link><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"><Save size={18}/>{saving ? "Saving..." : "Save Supplier"}</button></div>
    </form></section></div></main>;
}
