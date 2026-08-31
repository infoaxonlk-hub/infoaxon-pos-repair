"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, TrendingUp, WalletCards, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Summary = {
  today_pos_sales: number;
  today_repair_income: number;
  today_expenses: number;
  open_repairs: number;
  low_stock_items: number;
  customer_outstanding: number;
  supplier_outstanding: number;
};

const empty: Summary = {
  today_pos_sales: 0,
  today_repair_income: 0,
  today_expenses: 0,
  open_repairs: 0,
  low_stock_items: 0,
  customer_outstanding: 0,
  supplier_outstanding: 0,
};

const money = (value: number) =>
  `LKR ${Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function DashboardLiveSummary() {
  const [summary, setSummary] = useState<Summary>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("business_dashboard_summary")
        .select("today_pos_sales,today_repair_income,today_expenses,open_repairs,low_stock_items,customer_outstanding,supplier_outstanding")
        .single();

      if (queryError) setError(queryError.message);
      else if (data) setSummary(data as Summary);
      setLoading(false);
    }
    void load();
  }, []);

  const estimatedProfit =
    Number(summary.today_pos_sales) +
    Number(summary.today_repair_income) -
    Number(summary.today_expenses);

  const cards = [
    {
      title: "Today's Sales",
      value: money(summary.today_pos_sales),
      note: "Completed POS sales today",
      icon: CircleDollarSign,
      iconStyle: "bg-blue-50 text-blue-600",
    },
    {
      title: "Repair Income",
      value: money(summary.today_repair_income),
      note: `${summary.open_repairs} open repair jobs`,
      icon: Wrench,
      iconStyle: "bg-violet-50 text-violet-600",
    },
    {
      title: "Today's Expenses",
      value: money(summary.today_expenses),
      note: "Paid expenses today",
      icon: WalletCards,
      iconStyle: "bg-orange-50 text-orange-600",
    },
    {
      title: "Estimated Profit",
      value: money(estimatedProfit),
      note: `${summary.low_stock_items} low-stock items`,
      icon: TrendingUp,
      iconStyle: estimatedProfit >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
    },
  ];

  if (loading) return <div className="rounded-2xl border bg-white p-6 text-slate-500">Loading live dashboard figures...</div>;
  if (error) return <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">Dashboard figures could not be loaded: {error}</div>;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div><p className="text-sm font-medium text-slate-500">{card.title}</p><h3 className="mt-2 text-2xl font-bold">{card.value}</h3></div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconStyle}`}><Icon size={21} /></div>
              </div>
              <p className="mt-4 text-xs text-slate-500">{card.note}</p>
            </article>
          );
        })}
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Customer Outstanding</p><p className="mt-2 text-xl font-bold text-amber-700">{money(summary.customer_outstanding)}</p></article>
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Supplier Outstanding</p><p className="mt-2 text-xl font-bold text-red-700">{money(summary.supplier_outstanding)}</p></article>
      </section>
    </>
  );
}
