import Link from "next/link";
import { ArrowLeft, Barcode, FolderTree, Package, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

function formatCurrency(value: number | string | null) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export default async function ProductsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_id")
    .eq("id", user!.id)
    .single();

  const { data: products, error } = await supabase
    .from("products")
    .select(`
  id,
  name,
  sku,
  barcode,
  product_type,
  brand,
  model,
  unit_name,
  cost_price,
  selling_price,
  minimum_stock,
  active,
  product_categories(name)
`)
    .eq("business_id", profile!.business_id)
    .order("name");

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              <ArrowLeft size={18} />
              Back to Dashboard
            </Link>

            <h1 className="text-3xl font-bold text-slate-950">Products</h1>
            <p className="mt-1 text-slate-500">
              Manage products, accessories and repair service items.
            </p>
          </div>

         <div className="flex flex-col gap-3 sm:flex-row">
  <Link
    href="/products/categories"
    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
  >
    <FolderTree size={19} />
    Categories
  </Link>

  <Link
    href="/products/new"
    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700"
  >
    <Plus size={19} />
    New Product
  </Link>
</div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total Products</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {products?.length ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Stockable Items</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">
              {products?.filter((product) => product.product_type === "stockable")
                .length ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Service Items</p>
            <p className="mt-2 text-3xl font-bold text-violet-600">
              {products?.filter((product) => product.product_type === "service")
                .length ?? 0}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <Package size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Product Master</h2>
                <p className="text-sm text-slate-500">
                  Products retrieved from Supabase
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="p-8 text-center text-red-600">
              Unable to load products: {error.message}
            </div>
          ) : products && products.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">SKU / Barcode</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Cost Price</th>
                    <th className="px-6 py-4">Selling Price</th>
                    <th className="px-6 py-4">Minimum Stock</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-950">
                          {product.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {[product.brand, product.model]
                            .filter(Boolean)
                            .join(" ") || "No brand or model"}
                        </p>
                      </td>
<td className="px-6 py-4">
  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
    {product.product_categories?.[0]?.name ?? "Uncategorized"}
  </span>
</td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-700">
                          {product.sku}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                          <Barcode size={14} />
                          {product.barcode || "No barcode"}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                          {product.product_type}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-medium text-slate-700">
                        {formatCurrency(product.cost_price)}
                      </td>

                      <td className="px-6 py-4 font-bold text-slate-950">
                        {formatCurrency(product.selling_price)}
                      </td>

                      <td className="px-6 py-4 text-slate-700">
                        {product.minimum_stock} {product.unit_name}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            product.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {product.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
  <Link
    href={`/products/${product.id}/edit`}
    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
  >
    <Pencil size={15} />
    Edit
  </Link>
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <Package className="mx-auto text-slate-300" size={46} />
              <h3 className="mt-4 text-lg font-bold text-slate-950">
                No products found
              </h3>
              <p className="mt-1 text-slate-500">
                Add your first product to begin managing inventory.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}