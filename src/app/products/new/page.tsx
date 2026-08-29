"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, PackagePlus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      setError("Your business profile could not be found.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("products").insert({
      business_id: profile.business_id,
      name: String(formData.get("name") || "").trim(),
      sku: String(formData.get("sku") || "").trim(),
      barcode: String(formData.get("barcode") || "").trim() || null,
      product_type: String(formData.get("product_type") || "stockable"),
      brand: String(formData.get("brand") || "").trim() || null,
      model: String(formData.get("model") || "").trim() || null,
      unit_name: String(formData.get("unit_name") || "Unit").trim(),
      cost_price: Number(formData.get("cost_price") || 0),
      selling_price: Number(formData.get("selling_price") || 0),
      minimum_stock: Number(formData.get("minimum_stock") || 0),
      track_serial_number: formData.get("track_serial_number") === "on",
      allow_price_change: formData.get("allow_price_change") === "on",
      description:
        String(formData.get("description") || "").trim() || null,
      active: true,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

   window.location.href = "/products";
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/products"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft size={18} />
          Back to Products
        </Link>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center gap-4 border-b border-slate-200 p-6">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <PackagePlus size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                New Product
              </h1>
              <p className="text-slate-500">
                Create a product, accessory or repair service item.
              </p>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="space-y-8 p-6">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Product name *
                <input
                  name="name"
                  required
                  placeholder="Example: iPhone 15 Tempered Glass"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                SKU *
                <input
                  name="sku"
                  required
                  placeholder="Example: ACC-0001"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Barcode
                <input
                  name="barcode"
                  placeholder="Scan or enter barcode"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Product type *
                <select
                  name="product_type"
                  defaultValue="stockable"
                  className={inputClass}
                >
                  <option value="stockable">Stockable Item</option>
                  <option value="service">Service Item</option>
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Unit of measure *
                <input
                  name="unit_name"
                  required
                  defaultValue="Unit"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Brand
                <input
                  name="brand"
                  placeholder="Example: Apple"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Model
                <input
                  name="model"
                  placeholder="Example: iPhone 15"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Cost price (LKR) *
                <input
                  name="cost_price"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Selling price (LKR) *
                <input
                  name="selling_price"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Minimum stock
                <input
                  name="minimum_stock"
                  type="number"
                  min="0"
                  step="0.001"
                  defaultValue="0"
                  className={inputClass}
                />
              </label>

              <div className="space-y-4 pt-7">
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    name="track_serial_number"
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-blue-600"
                  />
                  Track serial numbers
                </label>

                <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    name="allow_price_change"
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-blue-600"
                  />
                  Allow price changes during sale
                </label>
              </div>

              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Description
                <textarea
                  name="description"
                  rows={4}
                  placeholder="Optional product description"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
              <Link
                href="/products"
                className="rounded-xl border border-slate-300 px-5 py-3 text-center font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={19} />
                {saving ? "Saving..." : "Save Product"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}