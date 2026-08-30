"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, FolderTree, Pencil, Plus, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Category = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export default function ProductCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
const [editingName, setEditingName] = useState("");
const [editingDescription, setEditingDescription] = useState("");

  useEffect(() => {
    async function loadCategories() {
      const supabase = createClient();

      const { data, error: loadError } = await supabase
        .from("product_categories")
        .select("id, name, description, active")
        .order("name");

      if (loadError) {
        setError(loadError.message);
      } else {
        setCategories(data || []);
      }

      setLoading(false);
    }

    loadCategories();
  }, []);
function startEditing(category: Category) {
  setEditingId(category.id);
  setEditingName(category.name);
  setEditingDescription(category.description ?? "");
  setError("");
}
async function saveEditing() {
  if (!editingId || !editingName.trim()) {
    setError("Category name is required.");
    return;
  }

  setSaving(true);
  setError("");

  const supabase = createClient();

  const { data, error: updateError } = await supabase
    .from("product_categories")
    .update({
      name: editingName.trim(),
      description: editingDescription.trim() || null,
    })
    .eq("id", editingId)
    .select("id, name, description, active")
    .single();

  if (updateError) {
    setError(updateError.message);
  } else {
    setCategories((current) =>
      current.map((category) =>
        category.id === editingId ? data : category,
      ),
    );
    setEditingId(null);
    setEditingName("");
    setEditingDescription("");
  }

  setSaving(false);
}
async function toggleCategory(category: Category) {
  setSaving(true);
  setError("");

  const supabase = createClient();
  const newStatus = !category.active;

  const { error: updateError } = await supabase
    .from("product_categories")
    .update({ active: newStatus })
    .eq("id", category.id);

  if (updateError) {
    setError(updateError.message);
  } else {
    setCategories((current) =>
      current.map((item) =>
        item.id === category.id
          ? { ...item, active: newStatus }
          : item,
      ),
    );
  }

  setSaving(false);
}
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
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

    const { error: insertError } = await supabase
      .from("product_categories")
      .insert({
        business_id: profile.business_id,
        name: String(formData.get("name") || "").trim(),
        description:
          String(formData.get("description") || "").trim() || null,
        active: true,
      });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/products"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft size={18} />
          Back to Products
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-950">
            Product Categories
          </h1>
          <p className="mt-1 text-slate-500">
            Organize products, accessories and service items.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <Plus size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">New Category</h2>
                <p className="text-sm text-slate-500">
                  Add a product category
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <label className="block text-sm font-semibold text-slate-700">
                Category name *
                <input
                  name="name"
                  required
                  placeholder="Example: Mobile Accessories"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Description
                <textarea
                  name="description"
                  rows={4}
                  placeholder="Optional description"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={18} />
                {saving ? "Saving..." : "Save Category"}
              </button>
            </form>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 p-6">
              <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
                <FolderTree size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Categories</h2>
                <p className="text-sm text-slate-500">
                  {categories.length} categories found
                </p>
              </div>
            </div>

            {loading ? (
              <p className="p-8 text-center font-medium text-slate-500">
                Loading categories...
              </p>
            ) : categories.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {categories.map((category) => (
                  <article
                    key={category.id}
                    className="flex items-center justify-between gap-4 p-5 hover:bg-slate-50"
                  >
                    {editingId === category.id ? (
  <div className="flex-1 space-y-2">
    <input
      type="text"
      value={editingName}
      onChange={(event) => setEditingName(event.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      placeholder="Category name"
    />

    <textarea
      value={editingDescription}
      onChange={(event) => setEditingDescription(event.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      placeholder="Description"
      rows={2}
    />

    <div className="flex gap-2">
      <button
        type="button"
        onClick={saveEditing}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Save size={15} />
        Save
      </button>

      <button
        type="button"
        onClick={() => setEditingId(null)}
        disabled={saving}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  </div>
) : (
  <div>
    <h3 className="font-bold text-slate-950">
      {category.name}
    </h3>
    <p className="mt-1 text-sm text-slate-500">
      {category.description || "No description"}
    </p>
  </div>
)}

                   <div className="flex items-center gap-2">
  <span
    className={`rounded-full px-3 py-1 text-xs font-semibold ${
      category.active
        ? "bg-emerald-50 text-emerald-700"
        : "bg-red-50 text-red-700"
    }`}
  >
    {category.active ? "Active" : "Inactive"}
  </span>

  <button
    type="button"
    onClick={() => startEditing(category)}
    disabled={saving}
    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
  >
    <Pencil size={15} />
    Edit
  </button>

  <button
    type="button"
    onClick={() => toggleCategory(category)}
    disabled={saving}
    className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
      category.active
        ? "bg-red-50 text-red-700 hover:bg-red-100"
        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
    }`}
  >
    {category.active ? "Deactivate" : "Activate"}
  </button>
</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <FolderTree className="mx-auto text-slate-300" size={44} />
                <h3 className="mt-4 font-bold text-slate-950">
                  No categories found
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Create the first category using the form.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}