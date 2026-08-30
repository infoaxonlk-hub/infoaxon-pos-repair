import Link from "next/link";
import { ArrowLeft, Boxes, CircleDollarSign, ClipboardCheck, Download, History, PackageCheck, Repeat2, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ search?: string; status?: string; branch?: string }>;
type Product = { id: string; sku: string; name: string; minimum_stock: number | string };
type Branch = { id: string; name: string };
type Balance = { id: string; branch_id: string; product_id: string; quantity: number | string; average_cost: number | string; updated_at: string };

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = await searchParams;
  const search = filters.search?.trim().toLowerCase() ?? "";
  const status = filters.status ?? "all";
  const branchFilter = filters.branch ?? "all";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("business_id").eq("id", user!.id).single();
  const businessId = profile?.business_id;

  const [productResult, branchResult, balanceResult] = await Promise.all([
    supabase.from("products").select("id, sku, name, minimum_stock").eq("business_id", businessId).eq("product_type", "stockable").eq("active", true).order("name"),
    supabase.from("branches").select("id, name").eq("business_id", businessId).eq("active", true).order("name"),
    supabase.from("stock_balances").select("id, branch_id, product_id, quantity, average_cost, updated_at").eq("business_id", businessId),
  ]);
  const products = (productResult.data ?? []) as Product[];
  const branches = (branchResult.data ?? []) as Branch[];
  const balances = (balanceResult.data ?? []) as Balance[];
  const balanceMap = new Map(balances.map((b) => [`${b.branch_id}:${b.product_id}`, b]));
  const rows = branches.flatMap((branch) => products.map((product) => {
    const balance = balanceMap.get(`${branch.id}:${product.id}`);
    const quantity = Number(balance?.quantity ?? 0);
    const averageCost = Number(balance?.average_cost ?? 0);
    const minimumStock = Number(product.minimum_stock ?? 0);
    const stockStatus = quantity <= 0 ? "out_of_stock" : minimumStock > 0 && quantity <= minimumStock ? "low_stock" : "in_stock";
    return { id: balance?.id ?? `${branch.id}:${product.id}`, branchId: branch.id, branchName: branch.name, sku: product.sku, productName: product.name, quantity, averageCost, minimumStock, stockValue: quantity * averageCost, stockStatus };
  }));
  const filtered = rows.filter((row) => (!search || `${row.sku} ${row.productName} ${row.branchName}`.toLowerCase().includes(search)) && (branchFilter === "all" || row.branchId === branchFilter) && (status === "all" || row.stockStatus === status));
  const inStock = rows.filter((r) => r.quantity > 0).length;
  const lowStock = rows.filter((r) => r.stockStatus === "low_stock").length;
  const totalValue = rows.reduce((sum, r) => sum + r.stockValue, 0);
  const error = productResult.error ?? branchResult.error ?? balanceResult.error;
  const money = (value: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 2 }).format(value);

  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-7xl">
    <header className="mb-8"><Link href="/" className="mb-4 inline-flex items-center gap-2 font-semibold text-blue-600"><ArrowLeft size={18}/>Back to Dashboard</Link><h1 className="text-3xl font-bold">Inventory</h1><p className="mt-2 text-slate-500">Monitor stock, valuation, movements and branch transfers.</p></header>
    <nav className="mb-6 flex flex-wrap gap-3">
      <Action href="/inventory/movements" icon={<History size={18}/>} label="Movements"/><Action href="/inventory/count" icon={<ClipboardCheck size={18}/>} label="Stock Count"/><Action href="/inventory/transfers/new" icon={<Repeat2 size={18}/>} label="New Transfer"/><Action href="/inventory/adjustments/new" icon={<SlidersHorizontal size={18}/>} label="New Adjustment" primary/><Action href="/inventory/reports" icon={<Download size={18}/>} label="Reports & CSV"/>
    </nav>
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card title="Stock Items" value={String(rows.length)} icon={<Boxes/>}/><Card title="In Stock" value={String(inStock)} icon={<PackageCheck/>} color="text-emerald-600"/><Card title="Low Stock" value={String(lowStock)} icon={<TriangleAlert/>} color="text-amber-600"/><Card title="Inventory Value" value={money(totalValue)} icon={<CircleDollarSign/>} color="text-blue-600"/></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-6"><h2 className="text-lg font-bold">Current Stock</h2><p className="text-sm text-slate-500">{filtered.length} records found</p></div>
      <form className="grid gap-3 border-b bg-slate-50 p-5 lg:grid-cols-[1fr_220px_220px_auto_auto]"><div className="relative"><Search className="absolute left-4 top-4 text-slate-400" size={20}/><input name="search" defaultValue={filters.search ?? ""} placeholder="Search SKU, product or branch" className="h-14 w-full rounded-xl border bg-white pl-12 pr-4"/></div><select name="branch" defaultValue={branchFilter} className="h-14 rounded-xl border bg-white px-4"><option value="all">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select name="status" defaultValue={status} className="h-14 rounded-xl border bg-white px-4"><option value="all">All statuses</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option></select><button className="rounded-xl bg-blue-600 px-6 font-semibold text-white">Apply</button><Link href="/inventory" className="flex items-center justify-center rounded-xl border bg-white px-6 font-semibold">Clear</Link></form>
      {error ? <p className="p-10 text-center text-red-600">{error.message}</p> : filtered.length === 0 ? <div className="p-16 text-center"><Boxes className="mx-auto text-slate-300" size={54}/><h3 className="mt-4 text-lg font-bold">No inventory found</h3></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Product","Branch","Quantity","Reorder Level","Average Cost","Stock Value","Status"].map(h => <th key={h} className="px-6 py-4">{h}</th>)}</tr></thead><tbody className="divide-y">{filtered.map(row => <tr key={row.id} className="hover:bg-slate-50"><td className="px-6 py-4"><b>{row.productName}</b><p className="text-sm text-slate-500">{row.sku}</p></td><td className="px-6 py-4">{row.branchName}</td><td className="px-6 py-4 font-bold">{row.quantity.toLocaleString()}</td><td className="px-6 py-4">{row.minimumStock.toLocaleString()}</td><td className="px-6 py-4">{money(row.averageCost)}</td><td className="px-6 py-4 font-semibold">{money(row.stockValue)}</td><td className="px-6 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.stockStatus === "out_of_stock" ? "bg-red-50 text-red-700" : row.stockStatus === "low_stock" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{row.stockStatus.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div></main>;
}

function Action({ href, icon, label, primary=false }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) { return <Link href={href} className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 font-semibold shadow-sm ${primary ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{icon}{label}</Link>; }
function Card({ title, value, icon, color="text-slate-900" }: { title: string; value: string; icon: React.ReactNode; color?: string }) { return <div className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center gap-4"><div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 ${color}`}>{icon}</div><div className="min-w-0"><p className="text-sm text-slate-500">{title}</p><p className={`truncate text-2xl font-bold ${color}`}>{value}</p></div></div></div>; }
