import { BarChart3, Boxes, LayoutDashboard, Menu, Package, ReceiptText, Settings, ShoppingCart, Users, WalletCards, Wrench, Truck } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { DashboardLiveSummary } from "./dashboard-live-summary";
import { BrandLogo } from "./brand-logo";
import { getBusinessBrand } from "@/lib/branding-server";
import { logoUrl } from "@/lib/branding";

const menuItems = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/" },
  { name: "POS Billing", icon: ShoppingCart, href: "/pos" },
  { name: "Repairs", icon: Wrench, href: "/repairs" },
  { name: "Products", icon: Package, href: "/products" },
  { name: "Inventory", icon: Boxes, href: "/inventory" },
  { name: "Purchases", icon: ReceiptText, href: "/purchases" },
  { name: "Customers", icon: Users, href: "/customers" },
  { name: "Suppliers", icon: Truck, href: "/suppliers" },
  { name: "Expenses", icon: WalletCards, href: "/expenses" },
  { name: "Accounting", icon: WalletCards, href: "/accounting" },
  { name: "Reports", icon: BarChart3, href: "/reports" },
  { name: "Settings", icon: Settings, href: "/settings" },
];

function Navigation() {
  return <nav aria-label="Business navigation" className="space-y-1">
    {menuItems.map(({ name, icon: Icon, href }) => (
      <Link key={href} href={href} aria-current={href === "/" ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${href === "/" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white"}`}>
        <Icon size={19} aria-hidden="true" />{name}
      </Link>
    ))}
  </nav>;
}

export default async function Home() {
  const brand = await getBusinessBrand();
  const name = brand?.name ?? "InfoAxon POS";
  const fullName = brand?.full_name || "Administrator";
  const initials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const logo = logoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, brand?.logo_path ?? null);
  let date: string;
  try {
    date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: brand?.timezone ?? "Asia/Colombo" }).format(new Date());
  } catch {
    date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo" }).format(new Date());
  }
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
        <div className="flex min-h-20 items-center gap-3 border-b border-slate-800 px-5 py-4">
          <BrandLogo src={logo} name={name} />
          <div className="min-w-0"><h1 className="break-words font-bold">{name}</h1><p className="mt-1 text-xs text-slate-400">{brand?.code ?? "Business management"}</p></div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5"><Navigation /></div>
        <div className="border-t border-slate-800 p-4">
          <div className="rounded-xl bg-slate-900 p-4"><p className="text-sm font-semibold">{brand?.branch_name ?? "Business account"}</p><p className="mt-1 text-xs capitalize text-slate-400">{brand?.role ?? "Administrator"} account</p></div>
        </div>
      </aside>
      <section className="lg:pl-64">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <details className="relative lg:hidden">
              <summary aria-label="Open business menu" className="cursor-pointer list-none rounded-lg border border-slate-200 p-2"><Menu size={22} /></summary>
              <div className="absolute left-0 top-12 z-50 max-h-[70vh] w-64 overflow-y-auto rounded-xl bg-slate-950 p-3 shadow-xl"><Navigation /></div>
            </details>
            <div className="min-w-0"><h2 className="break-words text-xl font-bold">{name}</h2><p className="mt-1 text-sm text-slate-500">Business dashboard · {date}</p></div>
          </div>
          <div className="flex items-center gap-3"><LogoutButton /><span aria-label={fullName} className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">{initials}</span></div>
        </header>
        <div className="p-4 sm:p-8">
          <section className="brand-banner mb-8 flex flex-col justify-between gap-5 rounded-2xl p-6 sm:flex-row sm:items-center">
            <div><p className="text-sm">Welcome back, {fullName}</p><h3 className="mt-1 text-2xl font-bold">Ready to manage today&apos;s business?</h3></div>
            <div className="flex flex-wrap gap-3">
              <Link href="/pos" className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-700">New POS Sale</Link>
              <Link href="/repairs/new" className="rounded-xl border border-current px-5 py-3 text-sm font-semibold">New Repair Job</Link>
            </div>
          </section>
          <DashboardLiveSummary />
        </div>
      </section>
    </main>
  );
}
