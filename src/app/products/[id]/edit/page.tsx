"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProductForm = {
  name: string;
  category_id: string;
  sku: string;
  barcode: string;
  product_type: string;
  brand: string;
  model: string;
  unit_name: string;
  cost_price: number;
  selling_price: number;
  minimum_stock: number;
  track_serial_number: boolean;
  allow_price_change: boolean;
  description: string;
  active: boolean;
};
type Category = {
  id: string;
  name: string;
};
const emptyProduct: ProductForm = {
  name: "",
  category_id: "",
  sku: "",
  barcode: "",
  product_type: "stockable",
  brand: "",
  model: "",
  unit_name: "Unit",
  cost_price: 0,
  selling_price: 0,
  minimum_stock: 0,
  track_serial_number: false,
  allow_price_change: false,
  description: "",
  active: true,
};

export default function EditProductPage() {
  const params = useParams();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProduct() {
      const supabase = createClient();

      const { data, error: loadError } = await supabase
        .from("products")
        .select(
          "category_id, name, sku, barcode, product_type, brand, model, unit_name, cost_price, selling_price, minimum_stock, track_serial_number, allow_price_change, description, active",
        )
        .eq("id", productId)
        .single();

      if (loadError || !data) {
        setError(loadError?.message || "Product could not be found.");
        setLoading(false);
        return;
      }

      setProduct({
        name: data.name,
        category_id: data.category_id || "",
        sku: data.sku,
        barcode: data.barcode || "",
        product_type: data.product_type,
        brand: data.brand || "",
        model: data.model || "",
        unit_name: data.unit_name,
        cost_price: Number(data.cost_price),
        selling_price: Number(data.selling_price),
        minimum_stock: Number(data.minimum_stock),
        track_serial_number: data.track_serial_number,
        allow_price_change: data.allow_price_change,
        description: data.description || "",
        active: data.active,
      });

      setLoading(false);
    }

    if (productId) {
      loadProduct();
    }
  }, [productId]);
useEffect(() => {
  async function loadCategories() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    const { data } = await supabase
      .from("product_categories")
      .select("id, name")
      .eq("business_id", profile.business_id)
      .eq("active", true)
      .order("name");

    setCategories(data ?? []);
  }

  loadCategories();
}, []);
  function updateField<K extends keyof ProductForm>(
    field: K,
    value: ProductForm[K],
  ) {
    setProduct((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("products")
      .update({
        name: product.name.trim(),
        category_id: product.category_id || null,
        sku: product.sku.trim(),
        barcode: product.barcode.trim() || null,
        product_type: product.product_type,
        brand: product.brand.trim() || null,
        model: product.model.trim() || null,
        unit_name: product.unit_name.trim(),
        cost_price: product.cost_price,
        selling_price: product.selling_price,
        minimum_stock: product.minimum_stock,
        track_serial_number: product.track_serial_number,
        allow_price_change: product.allow_price_change,
        description: product.description.trim() || null,
        active: product.active,
      })
      .eq("id", productId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    window.location.href = "/products";
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="font-semibold text-slate-500">Loading product...</p>
      </main>
    );
  }

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
          <header className="border-b border-slate-200 p-6">
            <h1 className="text-2xl font-bold text-slate-950">
              Edit Product
            </h1>
            <p className="mt-1 text-slate-500">
              Update product details, pricing and status.
            </p>
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
                  required
                  value={product.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className={inputClass}
                />
              </label>
<label className="text-sm font-semibold text-slate-700">
  Category
  <select
    value={product.category_id}
    onChange={(event) => updateField("category_id", event.target.value)}
    className={inputClass}
  >
    <option value="">Select a category</option>
    {categories.map((category) => (
      <option key={category.id} value={category.id}>
        {category.name}
      </option>
    ))}
  </select>
</label>
              <label className="text-sm font-semibold text-slate-700">
                SKU *
                <input
                  required
                  value={product.sku}
                  onChange={(event) => updateField("sku", event.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Barcode
                <input
                  value={product.barcode}
                  onChange={(event) =>
                    updateField("barcode", event.target.value)
                  }
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Product type *
                <select
                  value={product.product_type}
                  onChange={(event) =>
                    updateField("product_type", event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="stockable">Stockable Item</option>
                  <option value="service">Service Item</option>
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Unit of measure *
                <input
                  required
                  value={product.unit_name}
                  onChange={(event) =>
                    updateField("unit_name", event.target.value)
                  }
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Brand
                <input
                  value={product.brand}
                  onChange={(event) => updateField("brand", event.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Model
                <input
                  value={product.model}
                  onChange={(event) => updateField("model", event.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Cost price (LKR) *
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={product.cost_price}
                  onChange={(event) =>
                    updateField("cost_price", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Selling price (LKR) *
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={product.selling_price}
                  onChange={(event) =>
                    updateField("selling_price", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Minimum stock
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={product.minimum_stock}
                  onChange={(event) =>
                    updateField("minimum_stock", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </label>

              <div className="space-y-4 pt-7">
                <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={product.track_serial_number}
                    onChange={(event) =>
                      updateField("track_serial_number", event.target.checked)
                    }
                    className="h-5 w-5 rounded border-slate-300 text-blue-600"
                  />
                  Track serial numbers
                </label>

                <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={product.allow_price_change}
                    onChange={(event) =>
                      updateField("allow_price_change", event.target.checked)
                    }
                    className="h-5 w-5 rounded border-slate-300 text-blue-600"
                  />
                  Allow price changes during sale
                </label>

                <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={product.active}
                    onChange={(event) =>
                      updateField("active", event.target.checked)
                    }
                    className="h-5 w-5 rounded border-slate-300 text-blue-600"
                  />
                  Active product
                </label>
              </div>

              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Description
                <textarea
                  rows={4}
                  value={product.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
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
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}