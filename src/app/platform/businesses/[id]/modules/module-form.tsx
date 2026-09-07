"use client";

import { useActionState, useState } from "react";
import { MODULES, MODULE_IDS, type ModuleId } from "@/lib/modules";
import { saveModules } from "./actions";

export function ModuleForm({ id, revision, enabled }: { id: string; revision: number; enabled: ModuleId[] }) {
  const [selected, setSelected] = useState(enabled);
  const [state, action, pending] = useActionState(saveModules, { error: "" });
  return <form action={action} className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="revision" value={revision} />
    <fieldset disabled={pending}>
      <legend className="text-xl font-semibold">Enabled modules · {selected.length}/{MODULES.length}</legend>
      <p className="mt-2 text-sm text-slate-600">Products, Customers, Suppliers, payment methods, Dashboard and Settings are shared core features. Stock processing for enabled POS, Repairs and Purchases continues even if Inventory tools are off.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {MODULES.map((module) => <label key={module.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 has-checked:border-indigo-500 has-checked:bg-indigo-50">
          <input type="checkbox" name="modules" value={module.id} checked={selected.includes(module.id)}
            onChange={(event) => setSelected(event.target.checked ? [...selected, module.id] : selected.filter((id) => id !== module.id))}
            className="mt-1 h-4 w-4 accent-indigo-700" />
          <span><span className="block font-semibold">{module.name}</span><span className="mt-1 block text-sm text-slate-600">{module.description}</span></span>
        </label>)}
      </div>
      <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
        Disabled modules cannot create, edit, pay, return or delete transactions. Open jobs and POS sessions must be completed first, or the module re-enabled later. Existing data is never deleted; Dashboard and enabled Accounting/Reports retain historical figures.
      </div>
      {selected.length < MODULE_IDS.length && <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
        <span>I understand that the unchecked modules will be unavailable, including unfinished operations.</span>
      </label>}
      {state.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{state.error}</p>}
      <button disabled={pending} className="mt-5 rounded-xl bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save modules"}</button>
    </fieldset>
  </form>;
}
