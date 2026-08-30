import Link from "next/link";
import {
  ArrowLeft, Barcode, ChevronLeft, ChevronRight, FolderTree,
  Package, Pencil, Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

function formatCurrency(value: number | string | null) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency", currency: "LKR", minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function getCategoryName(category: unknown) {
  if (Array.isArray(category)) return category[0]?.name ?? "Uncategorized";
  if (category && typeof category === "object" && "name" in category) {
    return String(category.name);
  }
  return "Uncategorized";
}

export default async function ProductsPage({ searchParams }: {
  searchParams: Promise<{
    search?: string; category?: string; type?: string;
    status?: string; page?: string;
  }>;
}) {
  const filters = await searchParams;
  const search = filters.search?.trim() ?? "";
  const category = filters.category ?? "all";
  const type = filters.type ?? "all";
  const status = filters.status ?? "all";
  const parsedPage = Number.parseInt(filters.page ?? "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles")
    .select("business_id").eq("id", user!.id).single();
  const businessId = profile!.business_id;

  const [{ data: categories }, total, stockable, services] = await Promise.all([
    supabase.from("product_categories").select("id, name")
      .eq("business_id", businessId).order("name"),
    supabase.from("products").select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    supabase.from("products").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("product_type", "stockable"),
    supabase.from("products").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("product_type", "service"),
  ]);

  let query = supabase.from("products").select(`
    id, category_id, name, sku, barcode, product_type, brand, model,
    unit_name, cost_price, selling_price, minimum_stock, active,
    category:product_categories!products_category_business_fk(name)
  `, { count: "exact" }).eq("business_id", businessId);

  const safeSearch = search.replace(/[,%()]/g, "");
  if (safeSearch) query = query.or(
    `name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%,barcode.ilike.%${safeSearch}%,brand.ilike.%${safeSearch}%,model.ilike.%${safeSearch}%`,
  );
  if (category !== "all") query = query.eq("category_id", category);
  if (type !== "all") query = query.eq("product_type", type);
  if (status !== "all") query = query.eq("active", status === "active");

  const from = (currentPage - 1) * PAGE_SIZE;
  const { data: products, error, count } = await query.order("name")
    .range(from, from + PAGE_SIZE - 1);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasFilters = Boolean(search) || category !== "all" || type !== "all" || status !== "all";

  function pageUrl(page: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category !== "all") params.set("category", category);
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    if (page > 1) params.set("page", String(page));
    const queryString = params.toString();
    return queryString ? `/products?${queryString}` : "/products";
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700">
              <ArrowLeft size={18} /> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-slate-950">Products</h1>
            <p className="mt-1 text-slate-500">Manage products, accessories and repair service items.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/products/categories" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">
              <FolderTree size={19} /> Categories
            </Link>
            <Link href="/products/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-700">
              <Plus size={19} /> New Product
            </Link>
          </div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Total Products", total.count ?? 0, "text-slate-950"],
            ["Stockable Items", stockable.count ?? 0, "text-blue-600"],
            ["Service Items", services.count ?? 0, "text-violet-600"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{label}</p>
              <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Package size={22} /></div>
            <div>
              <h2 className="font-bold text-slate-950">Product Master</h2>
              <p className="text-sm text-slate-500">{count ?? 0} product{count === 1 ? "" : "s"} found</p>
            </div>
          </div>

          <form method="GET" className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_190px_170px_170px_auto_auto]">
            <input type="search" name="search" defaultValue={search} placeholder="Search name, SKU, barcode, brand or model" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500" />
            <select name="category" defaultValue={category} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
              <option value="all">All categories</option>
              {(categories ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select name="type" defaultValue={type} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
              <option value="all">All types</option><option value="stockable">Stockable items</option><option value="service">Service items</option>
            </select>
            <select name="status" defaultValue={status} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
              <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
            <button type="submit" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">Apply</button>
            <Link href="/products" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100">Clear</Link>
          </form>

          {error ? (
            <div className="p-8 text-center text-red-600">Unable to load products: {error.message}</div>
          ) : products?.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>{["Product", "Category", "SKU / Barcode", "Type", "Cost Price", "Selling Price", "Minimum Stock", "Status", "Actions"].map((heading) => <th key={heading} className="px-6 py-4">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-950">{product.name}</p>
                          <p className="text-sm text-slate-500">{[product.brand, product.model].filter(Boolean).join(" ") || "No brand or model"}</p>
                        </td>
                        <td className="px-6 py-4"><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{getCategoryName(product.category)}</span></td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-700">{product.sku}</p>
                          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><Barcode size={14} />{product.barcode || "No barcode"}</p>
                        </td>
                        <td className="px-6 py-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">{product.product_type}</span></td>
                        <td className="px-6 py-4 font-medium text-slate-700">{formatCurrency(product.cost_price)}</td>
                        <td className="px-6 py-4 font-bold text-slate-950">{formatCurrency(product.selling_price)}</td>
                        <td className="px-6 py-4 text-slate-700">{product.minimum_stock} {product.unit_name}</td>
                        <td className="px-6 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${product.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{product.active ? "Active" : "Inactive"}</span></td>
                        <td className="px-6 py-4"><Link href={`/products/${product.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"><Pencil size={15} />Edit</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">Page {currentPage} of {totalPages} · {count ?? 0} products</p>
                  <div className="flex gap-2">
                    {currentPage > 1 ? <Link href={pageUrl(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><ChevronLeft size={16} />Previous</Link> : <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-300"><ChevronLeft size={16} />Previous</span>}
                    {currentPage < totalPages ? <Link href={pageUrl(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Next<ChevronRight size={16} /></Link> : <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-300">Next<ChevronRight size={16} /></span>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <Package className="mx-auto text-slate-300" size={46} />
              <h3 className="mt-4 text-lg font-bold text-slate-950">No products found</h3>
              <p className="mt-1 text-slate-500">{hasFilters ? "Try changing or clearing the current search filters." : "Add your first product to begin managing inventory."}</p>
              {hasFilters && <Link href="/products" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Clear filters</Link>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
