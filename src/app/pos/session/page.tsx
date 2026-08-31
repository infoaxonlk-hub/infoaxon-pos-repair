"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  LogOut,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Session = {
  id: string;
  status: "open" | "closed";
  opening_balance: number;
  expected_cash: number;
  closing_cash: number | null;
  cash_difference: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

type Sale = { id: string; session_id: string; status: string; grand_total: number };
type Payment = { sale_id: string; amount: number; payment_method_id: string };
type Method = { id: string; name: string; payment_kind: string };

const money = (value: number) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(value);

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";

export default function PosSessionPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) { window.location.href = "/login"; return; }
    setUserId(user.id);

    const sessionResult = await supabase
      .from("pos_sessions")
      .select("id,status,opening_balance,expected_cash,closing_cash,cash_difference,opened_at,closed_at,notes")
      .eq("cashier_id", user.id)
      .order("opened_at", { ascending: false })
      .limit(30);

    if (sessionResult.error) {
      setError(sessionResult.error.message);
      setLoading(false);
      return;
    }

    const parsedSessions = (sessionResult.data ?? []).map((session) => ({
      ...session,
      opening_balance: Number(session.opening_balance),
      expected_cash: Number(session.expected_cash),
      closing_cash: session.closing_cash === null ? null : Number(session.closing_cash),
      cash_difference: session.cash_difference === null ? null : Number(session.cash_difference),
    })) as Session[];
    setSessions(parsedSessions);

    const ids = parsedSessions.map((session) => session.id);
    const [saleResult, methodResult] = await Promise.all([
      ids.length
        ? supabase.from("pos_sales").select("id,session_id,status,grand_total").in("session_id", ids)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("pos_payment_methods").select("id,name,payment_kind").order("name"),
    ]);

    if (saleResult.error || methodResult.error) {
      setError(saleResult.error?.message ?? methodResult.error?.message ?? "Unable to load session totals.");
      setLoading(false);
      return;
    }

    const parsedSales = (saleResult.data ?? []).map((sale) => ({ ...sale, grand_total:Number(sale.grand_total) })) as Sale[];
    setSales(parsedSales);
    setMethods((methodResult.data ?? []) as Method[]);

    const saleIds = parsedSales.map((sale) => sale.id);
    if (saleIds.length) {
      const paymentResult = await supabase
        .from("pos_sale_payments")
        .select("sale_id,amount,payment_method_id")
        .in("sale_id", saleIds);
      if (paymentResult.error) setError(paymentResult.error.message);
      setPayments((paymentResult.data ?? []).map((payment) => ({ ...payment, amount:Number(payment.amount) })) as Payment[]);
    } else setPayments([]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const openSession = sessions.find((session) => session.status === "open") ?? null;

  const currentSummary = useMemo(() => {
    if (!openSession) return { saleCount:0, grossSales:0, heldCount:0, byKind:new Map<string,number>() };
    const currentSales = sales.filter((sale) => sale.session_id === openSession.id);
    const currentSaleIds = new Set(currentSales.map((sale) => sale.id));
    const byKind = new Map<string,number>();
    for (const payment of payments.filter((payment) => currentSaleIds.has(payment.sale_id))) {
      const kind = methods.find((method) => method.id === payment.payment_method_id)?.payment_kind ?? "other";
      byKind.set(kind,(byKind.get(kind) ?? 0)+payment.amount);
    }
    return {
      saleCount:currentSales.filter((sale) => sale.status !== "held" && sale.status !== "voided").length,
      grossSales:currentSales.filter((sale) => sale.status !== "held" && sale.status !== "voided").reduce((sum,sale) => sum+sale.grand_total,0),
      heldCount:currentSales.filter((sale) => sale.status === "held").length,
      byKind,
    };
  }, [openSession,sales,payments,methods]);

  const counted = Number(closingCash || 0);
  const difference = openSession ? counted-openSession.expected_cash : 0;

  async function closeSession(event: FormEvent) {
    event.preventDefault();
    if (!openSession) return;
    if (!Number.isFinite(counted) || counted < 0) { setError("Enter a valid closing cash amount."); return; }
    setWorking(true);
    setError("");
    const { error: rpcError } = await createClient().rpc("close_pos_session", {
      p_session_id:openSession.id,
      p_closing_cash:counted,
      p_notes:notes || null,
    });
    if (rpcError) setError(rpcError.message);
    else { setShowClose(false);setClosingCash("");setNotes("");await load(); }
    setWorking(false);
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">Loading POS session...</main>;

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <Link href="/pos" className="inline-flex items-center gap-2 font-semibold text-blue-600"><ArrowLeft size={18}/>Back to POS Billing</Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><h1 className="text-3xl font-bold">Cashier Session</h1><p className="mt-1 text-slate-500">Review the till and close the current cashier session.</p></div>
          {openSession ? <button onClick={() => { setClosingCash(openSession.expected_cash.toFixed(2));setShowClose(true); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 font-bold text-white"><LogOut size={18}/>Close Session</button> : <Link href="/pos" className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 font-bold text-white">Open a New Session</Link>}
        </div>

        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

        {openSession ? <>
          <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500"/><h2 className="text-xl font-bold">Current Session Open</h2></div><p className="mt-1 text-sm text-slate-500">Opened {dateTime(openSession.opened_at)}</p></div><span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">ACTIVE</span></div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[{label:"Opening Cash",value:money(openSession.opening_balance),icon:<WalletCards/>},{label:"Completed Sales",value:currentSummary.saleCount,icon:<ReceiptText/>},{label:"Gross Sales",value:money(currentSummary.grossSales),icon:<Banknote/>},{label:"Held Bills",value:currentSummary.heldCount,icon:<Clock3/>}].map((card) => <div key={card.label} className="rounded-xl border bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm text-slate-500">{card.icon}{card.label}</div><p className="mt-2 text-xl font-bold">{card.value}</p></div>)}
            </div>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Payment Summary</h2><div className="mt-4 space-y-3">{[{kind:"cash",label:"Cash Payments",icon:<Banknote/>},{kind:"card",label:"Card Payments",icon:<CreditCard/>},{kind:"bank_transfer",label:"Bank Transfers",icon:<Landmark/>},{kind:"credit",label:"Credit Sales",icon:<CalendarClock/>}].map((item) => <div key={item.kind} className="flex items-center justify-between rounded-xl border p-4"><div className="flex items-center gap-3 text-slate-600">{item.icon}<span>{item.label}</span></div><span className="font-bold">{money(currentSummary.byKind.get(item.kind) ?? 0)}</span></div>)}</div></div>
            <div className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Cash Drawer</h2><div className="mt-4 rounded-xl bg-blue-50 p-5"><p className="text-sm font-medium text-blue-700">Expected Cash in Drawer</p><p className="mt-2 text-3xl font-bold text-blue-700">{money(openSession.expected_cash)}</p><p className="mt-2 text-xs text-blue-600">Opening cash + cash sales − cash refunds</p></div><button onClick={() => { setClosingCash(openSession.expected_cash.toFixed(2));setShowClose(true); }} className="mt-4 h-12 w-full rounded-xl bg-red-600 font-bold text-white">Count Cash & Close Session</button></div>
          </section>
        </> : <section className="mt-6 rounded-2xl border bg-white py-20 text-center shadow-sm"><CheckCircle2 className="mx-auto text-emerald-500" size={54}/><h2 className="mt-4 text-2xl font-bold">No Open Session</h2><p className="mt-2 text-slate-500">Start a new POS session from the billing screen.</p><Link href="/pos" className="mt-5 inline-flex rounded-xl bg-blue-600 px-6 py-3 font-bold text-white">Go to POS Billing</Link></section>}

        <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-bold">Recent Sessions</h2><p className="text-sm text-slate-500">Your latest cashier opening and closing records.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b bg-slate-50 text-sm text-slate-500"><tr><th className="px-5 py-4">Opened</th><th className="px-5 py-4">Closed</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Opening</th><th className="px-5 py-4 text-right">Expected</th><th className="px-5 py-4 text-right">Closing</th><th className="px-5 py-4 text-right">Difference</th></tr></thead><tbody className="divide-y">{sessions.map((session) => <tr key={session.id}><td className="px-5 py-4 text-sm">{dateTime(session.opened_at)}</td><td className="px-5 py-4 text-sm">{dateTime(session.closed_at)}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${session.status==="open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{session.status}</span></td><td className="px-5 py-4 text-right">{money(session.opening_balance)}</td><td className="px-5 py-4 text-right">{money(session.expected_cash)}</td><td className="px-5 py-4 text-right">{session.closing_cash===null ? "—" : money(session.closing_cash)}</td><td className={`px-5 py-4 text-right font-bold ${(session.cash_difference ?? 0)<0 ? "text-red-600" : (session.cash_difference ?? 0)>0 ? "text-emerald-600" : ""}`}>{session.cash_difference===null ? "—" : money(session.cash_difference)}</td></tr>)}</tbody></table></div></section>
      </div>

      {showClose && openSession && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={closeSession} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-2xl font-bold">Close Cashier Session</h2><p className="mt-1 text-slate-500">Count the physical cash in the drawer before closing.</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-100 p-4"><p className="text-sm text-slate-500">Expected Cash</p><p className="mt-1 text-xl font-bold">{money(openSession.expected_cash)}</p></div><div className={`rounded-xl p-4 ${difference<0 ? "bg-red-50 text-red-700" : difference>0 ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}><p className="text-sm">Difference</p><p className="mt-1 text-xl font-bold">{money(difference)}</p></div></div><label className="mt-5 block text-sm font-semibold">Counted cash *</label><input type="number" min="0" step="0.01" required value={closingCash} onChange={(event) => setClosingCash(event.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4 text-lg"/><label className="mt-4 block text-sm font-semibold">Closing notes</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3" placeholder="Optional note about cash difference"/>{error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setShowClose(false)} className="h-11 rounded-xl border font-semibold">Cancel</button><button disabled={working} className="h-11 rounded-xl bg-red-600 font-bold text-white disabled:opacity-50">{working ? "Closing..." : "Confirm & Close"}</button></div></form></div>}
    </main>
  );
}
