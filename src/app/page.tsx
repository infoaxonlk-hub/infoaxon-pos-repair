import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  LayoutDashboard,
  Menu,
  Package,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  TriangleAlert,
  Users,
  WalletCards,
  Wrench,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { DashboardLiveSummary } from "./dashboard-live-summary";
const menuItems = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/", active: true },
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

const summaryCards = [
  {
    title: "Today's Sales",
    value: "LKR 128,450",
    note: "18 completed bills",
    icon: CircleDollarSign,
    iconStyle: "bg-blue-50 text-blue-600",
  },
  {
    title: "Repair Income",
    value: "LKR 42,500",
    note: "7 completed repairs",
    icon: Wrench,
    iconStyle: "bg-violet-50 text-violet-600",
  },
  {
    title: "Today's Expenses",
    value: "LKR 18,200",
    note: "5 expense entries",
    icon: WalletCards,
    iconStyle: "bg-orange-50 text-orange-600",
  },
  {
    title: "Estimated Profit",
    value: "LKR 61,850",
    note: "Sales and repairs",
    icon: TrendingUp,
    iconStyle: "bg-emerald-50 text-emerald-600",
  },
];

const repairStatuses = [
  { name: "Received", count: 8, color: "bg-blue-500" },
  { name: "In Progress", count: 5, color: "bg-amber-500" },
  { name: "Waiting for Parts", count: 3, color: "bg-violet-500" },
  { name: "Ready to Deliver", count: 6, color: "bg-emerald-500" },
];

const lowStockItems = [
  { name: "iPhone 13 Tempered Glass", stock: 3 },
  { name: "Type-C Fast Charger", stock: 2 },
  { name: "Samsung A15 Display", stock: 1 },
  { name: "Universal TV Remote", stock: 4 },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-slate-800 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Smartphone size={22} />
          </div>

          <div>
            <h1 className="font-bold">InfoAxon POS</h1>
            <p className="text-xs text-slate-400">Repair & Retail System</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  item.active
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Icon size={19} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm font-semibold">Main Branch</p>
            <p className="mt-1 text-xs text-slate-400">
              Administrator account
            </p>
          </div>
        </div>
      </aside>

      <section className="lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex items-center gap-4">
            <button className="rounded-lg border border-slate-200 p-2 lg:hidden">
              <Menu size={20} />
            </button>

            <div>
              <h2 className="text-xl font-bold">Business Dashboard</h2>
              <p className="hidden text-sm text-slate-500 sm:block">
                Friday, 28 August 2026
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="hidden items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 sm:flex">
              <Search size={17} />
              Search
            </button>
            <LogoutButton />
          

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
              AD
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-8">
          <section className="mb-8 flex flex-col justify-between gap-5 rounded-2xl bg-gradient-to-r from-blue-700 to-blue-500 p-6 text-white sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-blue-100">
                Welcome back, Administrator
              </p>
              <h3 className="mt-1 text-2xl font-bold">
                Ready to manage today's business?
              </h3>
            </div>

            <div className="flex flex-wrap gap-3">
             <Link
  href="/pos"
  className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-700"
>
  New POS Sale
</Link>

             <Link
  href="/repairs/new"
  className="rounded-xl bg-blue-800/50 px-5 py-3 text-sm font-semibold ring-1 ring-white/30"
>
  New Repair Job
</Link>
            </div>
          </section>
<DashboardLiveSummary />
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {false && summaryCards.map((card) => {
              const Icon = card.icon;

              return (
                <article
                  key={card.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        {card.title}
                      </p>
                      <h3 className="mt-2 text-2xl font-bold">{card.value}</h3>
                    </div>

                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconStyle}`}
                    >
                      <Icon size={21} />
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">{card.note}</p>
                </article>
              );
            })}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
              <div className="mb-6">
                <h3 className="font-bold">Repair Job Overview</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Current repair workload and progress
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {repairStatuses.map((status) => (
                  <div
                    key={status.name}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-3 w-3 rounded-full ${status.color}`}
                        />
                        <p className="text-sm font-medium">{status.name}</p>
                      </div>

                      <span className="text-2xl font-bold">
                        {status.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold">Low Stock Alerts</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Items requiring attention
                  </p>
                </div>

                <div className="rounded-lg bg-red-50 p-2 text-red-600">
                  <TriangleAlert size={20} />
                </div>
              </div>

              <div className="space-y-4">
                {lowStockItems.map((item) => (
                  <div
                    key={item.name}
                    className="border-b border-slate-100 pb-4 last:border-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-medium">{item.name}</p>

                      <span className="rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-600">
                        {item.stock} left
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
