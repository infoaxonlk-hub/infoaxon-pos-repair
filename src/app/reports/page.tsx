"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Download, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type DayRow = {
  report_date: string;
  pos_sales: number;
  repair_income: number;
  expenses: number;
  net_result: number;
};

type ProductRow = {
  product_id: string;
  sku: string;
  name: string;
  quantity_sold: number;
  sales_value: number;
  gross_profit: number;
};

const money = (value: number) =>
  `LKR ${Number(value || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export default function MainReportsPage() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(isoDate(firstDay));
  const [toDate, setToDate] = useState(isoDate(today));
  const [days, setDays] = useState<DayRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReport() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      window.location.href = "/login";
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", auth.user.id)
      .single();
    if (profileError || !profile?.business_id) {
      setError(profileError?.message || "Business profile was not found.");
      setLoading(false);
      return;
    }

    const [dailyResult, productResult] = await Promise.all([
      supabase
        .from("daily_business_performance")
        .select("report_date,pos_sales,repair_income,expenses,net_result")
        .eq("business_id", profile.business_id)
        .gte("report_date", fromDate)
        .lte("report_date", toDate)
        .order("report_date", { ascending: false }),
      supabase
        .from("product_sales_summary")
        .select("product_id,sku,name,quantity_sold,sales_value,gross_profit")
        .eq("business_id", profile.business_id)
        .order("sales_value", { ascending: false })
        .limit(10),
    ]);

    if (dailyResult.error || productResult.error) {
      setError(dailyResult.error?.message || productResult.error?.message || "Report could not be loaded.");
    } else {
      setDays((dailyResult.data || []) as DayRow[]);
      setProducts((productResult.data || []) as ProductRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(
    () =>
      days.reduce(
        (sum, row) => ({
          sales: sum.sales + Number(row.pos_sales),
          repairs: sum.repairs + Number(row.repair_income),
          expenses: sum.expenses + Number(row.expenses),
          net: sum.net + Number(row.net_result),
        }),
        { sales: 0, repairs: 0, expenses: 0, net: 0 },
      ),
    [days],
  );

  function exportCsv() {
    const rows = [
      ["Date", "POS Sales", "Repair Income", "Expenses", "Net Result"],
      ...days.map((row) => [row.report_date, row.pos_sales, row.repair_income, row.expenses, row.net_result]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `business-report-${fromDate}-to-${toDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const cards = [
    { label: "POS Sales", value: totals.sales, color: "text-blue-700" },
    { label: "Repair Income", value: totals.repairs, color: "text-violet-700" },
    { label: "Expenses", value: totals.expenses, color: "text-red-700" },
    { label: "Net Result", value: totals.net, color: totals.net >= 0 ? "text-emerald-700" : "text-red-700" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-blue-700">
          <ArrowLeft size={18} /> Back to Dashboard
        </Link>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-950"><BarChart3 className="text-blue-600" /> Main Reports</h1>
            <p className="mt-1 text-slate-600">Sales, repairs, expenses and business performance.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportCsv} disabled={!days.length} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 font-semibold disabled:opacity-50"><Download size={18} /> Export CSV</button>
            <button onClick={() => void loadReport()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white"><RefreshCw size={18} /> Apply</button>
          </div>
        </div>

        <section className="mt-6 grid gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-2">
          <label className="font-semibold text-slate-700">From Date<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" /></label>
          <label className="font-semibold text-slate-700">To Date<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" /></label>
        </section>

        {error && <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => <div key={card.label} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{card.label}</p><p className={`mt-2 text-2xl font-bold ${card.color}`}>{money(card.value)}</p></div>)}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="text-xl font-bold">Daily Performance</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["Date","POS Sales","Repair Income","Expenses","Net Result"].map((h) => <th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody>
            {days.map((row) => <tr key={row.report_date} className="border-t"><td className="px-5 py-3">{row.report_date}</td><td className="px-5 py-3">{money(row.pos_sales)}</td><td className="px-5 py-3">{money(row.repair_income)}</td><td className="px-5 py-3">{money(row.expenses)}</td><td className={`px-5 py-3 font-bold ${Number(row.net_result) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{money(row.net_result)}</td></tr>)}
            {!loading && days.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No transactions found for this date range.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="text-xl font-bold">Top Products (All Time)</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["SKU","Product","Quantity Sold","Sales Value","Gross Profit"].map((h) => <th key={h} className="px-5 py-3">{h}</th>)}</tr></thead><tbody>
            {products.map((row) => <tr key={row.product_id} className="border-t"><td className="px-5 py-3">{row.sku}</td><td className="px-5 py-3 font-semibold">{row.name}</td><td className="px-5 py-3">{Number(row.quantity_sold).toLocaleString()}</td><td className="px-5 py-3">{money(row.sales_value)}</td><td className="px-5 py-3">{money(row.gross_profit)}</td></tr>)}
          </tbody></table></div>
        </section>
      </div>
    </main>
  );
}
