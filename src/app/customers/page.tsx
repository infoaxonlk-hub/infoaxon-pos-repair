import Link from "next/link";
import { ArrowLeft, Building2, ChevronLeft, ChevronRight, Pencil, Plus, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export default async function CustomersPage({ searchParams }: {
  searchParams: Promise<{ search?: string; type?: string; status?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const search = filters.search?.trim() ?? "";
  const type = filters.type ?? "all";
  const status = filters.status ?? "all";
  const parsedPage = Number.parseInt(filters.page ?? "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("business_id").eq("id", user!.id).single();
  const businessId = profile!.business_id;

  const [total, individuals, businesses] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("customer_type", "individual"),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("customer_type", "business"),
  ]);

  let query = supabase.from("customers").select(
    "id, code, customer_type, name, company_name, phone, email, city, credit_limit, opening_balance, active",
    { count: "exact" },
  ).eq("business_id", businessId);
  const safeSearch = search.replace(/[,%()]/g, "");
  if (safeSearch) query = query.or(`name.ilike.%${safeSearch}%,company_name.ilike.%${safeSearch}%,code.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
  if (type !== "all") query = query.eq("customer_type", type);
  if (status !== "all") query = query.eq("active", status === "active");
  const from = (currentPage - 1) * PAGE_SIZE;
  const { data: customers, error, count } = await query.order("name").range(from, from + PAGE_SIZE - 1);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasFilters = Boolean(search) || type !== "all" || status !== "all";

  function pageUrl(page: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    if (page > 1) params.set("page", String(page));
    const value = params.toString();
    return value ? `/customers?${value}` : "/customers";
  }

  const money = (value: number | string) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 2 }).format(Number(value));

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-7xl">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div>
      <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft size={18}/>Back to Dashboard</Link>
      <h1 className="text-3xl font-bold text-slate-950">Customers</h1><p className="mt-1 text-slate-500">Manage retail, business and repair customers.</p>
    </div><Link href="/customers/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm"><Plus size={19}/>New Customer</Link></header>

    <section className="mb-6 grid gap-4 sm:grid-cols-3">{[
      { label: "Total Customers", value: total.count ?? 0, Icon: Users, color: "text-slate-950", background: "bg-slate-100" },
      { label: "Individuals", value: individuals.count ?? 0, Icon: UserRound, color: "text-blue-600", background: "bg-blue-50" },
      { label: "Businesses", value: businesses.count ?? 0, Icon: Building2, color: "text-violet-600", background: "bg-violet-50" },
    ].map(({ label, value, Icon, color, background }) => <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`rounded-xl p-3 ${background}`}><Icon size={22} className={color}/></div><div><p className="text-sm text-slate-500">{label}</p><p className={`text-3xl font-bold ${color}`}>{value}</p></div></div>)}</section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5"><h2 className="font-bold text-slate-950">Customer Master</h2><p className="text-sm text-slate-500">{count ?? 0} customer{count === 1 ? "" : "s"} found</p></div>
      <form method="GET" className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(300px,1fr)_190px_190px_auto_auto]">
        <input name="search" type="search" defaultValue={search} placeholder="Search code, name, phone or email" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"/>
        <select name="type" defaultValue={type} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"><option value="all">All customer types</option><option value="individual">Individuals</option><option value="business">Businesses</option></select>
        <select name="status" defaultValue={status} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Apply</button><Link href="/customers" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700">Clear</Link>
      </form>
      {error ? <div className="p-8 text-center text-red-600">Unable to load customers: {error.message}</div> : customers?.length ? <>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Customer", "Type", "Contact", "Location", "Credit Limit", "Opening Balance", "Status", "Actions"].map((heading) => <th key={heading} className="px-6 py-4">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{customers.map((customer) => <tr key={customer.id} className="hover:bg-slate-50">
          <td className="px-6 py-4"><p className="font-semibold text-slate-950">{customer.name}</p><p className="text-sm text-slate-500">{customer.code}{customer.company_name ? ` · ${customer.company_name}` : ""}</p></td>
          <td className="px-6 py-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">{customer.customer_type}</span></td>
          <td className="px-6 py-4"><p className="font-medium text-slate-700">{customer.phone}</p><p className="text-sm text-slate-500">{customer.email || "No email"}</p></td><td className="px-6 py-4 text-slate-700">{customer.city || "Not provided"}</td>
          <td className="px-6 py-4 text-slate-700">{money(customer.credit_limit)}</td><td className="px-6 py-4 font-semibold text-slate-950">{money(customer.opening_balance)}</td>
          <td className="px-6 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${customer.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{customer.active ? "Active" : "Inactive"}</span></td>
          <td className="px-6 py-4"><Link href={`/customers/${customer.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><Pencil size={15}/>Edit</Link></td>
        </tr>)}</tbody></table></div>
        {totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4"><p className="text-sm text-slate-500">Page {currentPage} of {totalPages}</p><div className="flex gap-2">{currentPage > 1 ? <Link href={pageUrl(currentPage - 1)} className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-semibold"><ChevronLeft size={16}/>Previous</Link> : <span/>}{currentPage < totalPages && <Link href={pageUrl(currentPage + 1)} className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-semibold">Next<ChevronRight size={16}/></Link>}</div></div>}
      </> : <div className="px-6 py-16 text-center"><Users className="mx-auto text-slate-300" size={46}/><h3 className="mt-4 text-lg font-bold">No customers found</h3><p className="mt-1 text-slate-500">{hasFilters ? "Try changing or clearing the current filters." : "Add your first customer to get started."}</p>{hasFilters && <Link href="/customers" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Clear filters</Link>}</div>}
    </section>
  </div></main>;
}
