"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Save, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewCustomerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("business_id").eq("id", user.id).single();
    if (!profile) { setError("Your business profile could not be found."); setSaving(false); return; }
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const { error: insertError } = await supabase.from("customers").insert({
      business_id: profile.business_id,
      code: text("code").toUpperCase(), customer_type: text("customer_type"), name: text("name"),
      company_name: text("company_name") || null, phone: text("phone"), alternate_phone: text("alternate_phone") || null,
      email: text("email") || null, nic: text("nic") || null, tax_number: text("tax_number") || null,
      address: text("address") || null, city: text("city") || null,
      credit_limit: Number(form.get("credit_limit") || 0), opening_balance: Number(form.get("opening_balance") || 0),
      notes: text("notes") || null, active: true,
    });
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    window.location.href = "/customers";
  }

  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-4xl">
    <Link href="/customers" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft size={18}/>Back to Customers</Link>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-4 border-b border-slate-200 p-6"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><UserPlus size={26}/></div><div><h1 className="text-2xl font-bold">New Customer</h1><p className="text-slate-500">Create a retail, business or repair customer.</p></div></header>
      <form onSubmit={handleSubmit} className="space-y-8 p-6">{error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
        <div><h2 className="mb-4 font-bold text-slate-950">Basic information</h2><div className="grid gap-6 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Customer code *<input name="code" required placeholder="Example: CUS-0001" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">Customer type *<select name="customer_type" className={input}><option value="individual">Individual</option><option value="business">Business</option></select></label>
          <label className="text-sm font-semibold text-slate-700">Customer name *<input name="name" required placeholder="Full name or contact person" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">Company name<input name="company_name" placeholder="Optional business name" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">Primary phone *<input name="phone" required placeholder="07X XXX XXXX" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">Alternate phone<input name="alternate_phone" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">Email<input name="email" type="email" placeholder="customer@example.com" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">NIC / Registration no.<input name="nic" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Tax number<input name="tax_number" placeholder="VAT/TIN (optional)" className={input}/></label>
        </div></div>
        <div><h2 className="mb-4 font-bold text-slate-950">Address and account</h2><div className="grid gap-6 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Address<textarea name="address" rows={3} className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">City<input name="city" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">Credit limit<input name="credit_limit" type="number" min="0" step="0.01" defaultValue="0" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700">Opening balance<input name="opening_balance" type="number" step="0.01" defaultValue="0" className={input}/></label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Internal notes<textarea name="notes" rows={3} className={input}/></label>
        </div></div>
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-6"><Link href="/customers" className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700">Cancel</Link><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"><Save size={18}/>{saving ? "Saving..." : "Save Customer"}</button></div>
      </form>
    </section>
  </div></main>;
}
