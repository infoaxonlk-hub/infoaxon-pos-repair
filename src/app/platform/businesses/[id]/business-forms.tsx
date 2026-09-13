"use client";

import { useActionState, useState } from "react";
import { saveDetails, saveLogo } from "./actions";
import { BrandLogo } from "@/app/brand-logo";
import { DEFAULT_PRIMARY, DEFAULT_ACCENT, themeText, HEX, type BusinessDetails } from "@/lib/branding";

const field = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:outline-indigo-600";
const button = "rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-50";
const initial = { error: "" };

export function BusinessForms({ business, logo }: { business: BusinessDetails; logo: string | null }) {
  const [detailsState, detailsAction, saving] = useActionState(saveDetails, initial);
  const [logoState, logoAction, uploading] = useActionState(saveLogo, initial);
  const [primary, setPrimary] = useState(business.primary_color);
  const [accent, setAccent] = useState(business.accent_color);
  const [active, setActive] = useState(business.active);
  const [name, setName] = useState(business.name);
  const foreground = themeText(primary, accent);
  const pending = saving || uploading;
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <form action={detailsAction} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="id" value={business.id} />
        <input type="hidden" name="version" value={business.updated_at} />
        <fieldset disabled={pending} className="grid gap-5">
          <legend className="mb-5 text-xl font-bold">Business details</legend>
          <label>Business name<input className={field} name="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Phone<input className={field} name="phone" maxLength={30} defaultValue={business.phone ?? ""} /></label>
            <label>Email<input className={field} name="email" type="email" maxLength={254} defaultValue={business.email ?? ""} /></label>
          </div>
          <label>Address<textarea className={field} name="address" rows={3} maxLength={500} defaultValue={business.address ?? ""} /></label>
          <p className="text-sm text-slate-500">Code: {business.code} · Currency: {business.currency_code} · Timezone: {business.timezone}</p>
          <h3 className="text-lg font-semibold">Theme colors</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>Primary color<div className="mt-2 flex gap-2">
              <input aria-label="Pick primary color" type="color" value={HEX.test(primary) ? primary : DEFAULT_PRIMARY} onChange={(e) => setPrimary(e.target.value)} className="h-12 w-14" />
              <input aria-label="Primary hex value" name="primary_color" value={primary} onChange={(e) => setPrimary(e.target.value)} pattern="#[0-9A-Fa-f]{6}" required className="w-full rounded-lg border border-slate-300 p-2" maxLength={7} />
            </div></div>
            <div>Accent color<div className="mt-2 flex gap-2">
              <input aria-label="Pick accent color" type="color" value={HEX.test(accent) ? accent : DEFAULT_ACCENT} onChange={(e) => setAccent(e.target.value)} className="h-12 w-14" />
              <input aria-label="Accent hex value" name="accent_color" value={accent} onChange={(e) => setAccent(e.target.value)} pattern="#[0-9A-Fa-f]{6}" required className="w-full rounded-lg border border-slate-300 p-2" maxLength={7} />
            </div></div>
          </div>
          <button type="button" className="w-fit text-sm font-semibold text-indigo-700" onClick={() => { setPrimary(DEFAULT_PRIMARY); setAccent(DEFAULT_ACCENT); }}>Reset colors to defaults</button>
          {!foreground && <p role="alert" className="text-sm text-red-700">These colors do not share a readable text color. Use two darker or two lighter colors.</p>}
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="flex items-center gap-3 font-semibold"><input type="checkbox" name="active" checked={active} onChange={(e) => setActive(e.target.checked)} />Business active</label>
            <p className="mt-2 text-sm text-slate-600">Deactivation blocks this business on subsequent protected requests. Data is retained.</p>
            {!active && <label className="mt-3 flex items-start gap-3 text-sm text-red-800"><input type="checkbox" name="confirmInactive" value="yes" required className="mt-1" />I confirm this business and its staff should lose access.</label>}
          </div>
          {detailsState.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{detailsState.error}</p>}
          <button className={button} disabled={pending || !foreground}>{saving ? "Saving…" : "Save details and theme"}</button>
        </fieldset>
      </form>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 bg-slate-950 p-5 text-white"><BrandLogo src={logo} name={name} /><div><p className="font-bold">{name || "Your business"}</p><p className="text-xs text-slate-300">Business dashboard preview</p></div></div>
          <div className="m-5 rounded-xl p-5" style={{ background: "linear-gradient(100deg," + (HEX.test(primary) ? primary : DEFAULT_PRIMARY) + "," + (HEX.test(accent) ? accent : DEFAULT_ACCENT) + ")", color: foreground ?? "#ffffff" }}>
            <p className="text-sm">Welcome back</p><h3 className="mt-2 text-xl font-bold">Ready for today&apos;s business?</h3>
          </div>
          <p className="px-5 pb-5 text-xs text-slate-500">Preview only. Save to apply. Clients see changes after refresh.</p>
        </section>
        <form action={logoAction} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="id" value={business.id} /><input type="hidden" name="version" value={business.updated_at} />
          <fieldset disabled={pending} className="grid gap-4">
            <legend className="mb-4 text-xl font-bold">Business logo</legend>
            <BrandLogo src={logo} name={business.name} className="h-20 w-20" />
            <label>Choose logo<input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm" /></label>
            <p className="text-sm text-slate-600">PNG, JPEG or WebP. Maximum 512 KB and 16 megapixels. Saved as a resized, metadata-stripped WebP.</p>
            <p className="text-xs text-slate-500">Logos are public brand assets. Do not upload private documents.</p>
            {business.logo_path && <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="removeLogo" value="yes" className="mt-1" />Remove the current logo instead of uploading. Old files are retained for recovery.</label>}
            {logoState.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{logoState.error}</p>}
            <button className={button} disabled={pending}>{uploading ? "Saving logo…" : "Save logo"}</button>
            <p className="text-xs text-slate-500">Save details first if you edited both sections.</p>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
