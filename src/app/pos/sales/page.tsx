"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Eye,
  Pause,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  X,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Sale = {
  id: string;
  customer_id: string | null;
  sale_number: string;
  status: "held" | "completed" | "voided" | "partially_refunded" | "refunded";
  sale_date: string;
  subtotal: number;
  line_discount_total: number;
  bill_discount: number;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change_amount: number;
  notes: string | null;
};

type SaleLine = {
  id: string;
  product_id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  line_total: number;
  returned_quantity: number;
};

type Customer = { id: string; name: string; phone: string };
type Product = { id: string; name: string; sku: string; product_type: string };
type Method = { id: string; name: string; payment_kind: string };
type Payment = { id: string; amount: number; reference_number: string | null; payment_method_id: string };
type ReturnEntry = { id: string; return_number: string; return_date: string; reason: string; refund_total: number };

const money = (value: number) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(value);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const badge: Record<Sale["status"], string> = {
  held: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  voided: "bg-slate-200 text-slate-600",
  partially_refunded: "bg-orange-100 text-orange-700",
  refunded: "bg-red-100 text-red-700",
};

export default function PosSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [returns, setReturns] = useState<ReturnEntry[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [returnReason, setReturnReason] = useState("");
  const [refundMethodId, setRefundMethodId] = useState("");

  async function loadSales() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const [saleResult, customerResult, productResult, methodResult] = await Promise.all([
      supabase.from("pos_sales").select("*").order("sale_date", { ascending: false }).limit(500),
      supabase.from("customers").select("id,name,phone"),
      supabase.from("products").select("id,name,sku,product_type"),
      supabase.from("pos_payment_methods").select("id,name,payment_kind").eq("active", true).order("name"),
    ]);
    const firstError = [saleResult.error, customerResult.error, productResult.error, methodResult.error].find(Boolean);
    if (firstError) setError(firstError.message);
    setSales((saleResult.data ?? []).map((sale) => ({
      ...sale,
      subtotal: Number(sale.subtotal),
      line_discount_total: Number(sale.line_discount_total),
      bill_discount: Number(sale.bill_discount),
      tax_total: Number(sale.tax_total),
      grand_total: Number(sale.grand_total),
      paid_total: Number(sale.paid_total),
      change_amount: Number(sale.change_amount),
    })) as Sale[]);
    setCustomers((customerResult.data ?? []) as Customer[]);
    setProducts((productResult.data ?? []) as Product[]);
    setMethods((methodResult.data ?? []) as Method[]);
    setRefundMethodId(methodResult.data?.[0]?.id ?? "");
    setLoading(false);
  }

  useEffect(() => { void loadSales(); }, []);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const methodMap = useMemo(() => new Map(methods.map((method) => [method.id, method])), [methods]);

  const filtered = useMemo(() => sales.filter((sale) => {
    const term = search.trim().toLowerCase();
    const customer = sale.customer_id ? customerMap.get(sale.customer_id) : null;
    const matchesSearch = !term || sale.sale_number.toLowerCase().includes(term) || customer?.name.toLowerCase().includes(term) || customer?.phone.includes(term);
    const matchesStatus = status === "all" || sale.status === status;
    const saleDay = sale.sale_date.slice(0,10);
    return matchesSearch && matchesStatus && (!fromDate || saleDay >= fromDate) && (!toDate || saleDay <= toDate);
  }), [sales, search, status, fromDate, toDate, customerMap]);

  const summary = useMemo(() => ({
    count: filtered.length,
    completed: filtered.filter((sale) => sale.status === "completed" || sale.status === "partially_refunded" || sale.status === "refunded").reduce((sum,sale) => sum + sale.grand_total,0),
    held: filtered.filter((sale) => sale.status === "held").length,
    refunds: filtered.filter((sale) => sale.status === "partially_refunded" || sale.status === "refunded").length,
  }), [filtered]);

  async function openSale(sale: Sale) {
    setSelected(sale);
    setReturnMode(false);
    setReturnQty({});
    setRestock({});
    setReturnReason("");
    setError("");
    const supabase = createClient();
    const [lineResult, paymentResult, returnResult] = await Promise.all([
      supabase.from("pos_sale_lines").select("*").eq("sale_id", sale.id).order("id"),
      supabase.from("pos_sale_payments").select("id,amount,reference_number,payment_method_id").eq("sale_id", sale.id),
      supabase.from("pos_returns").select("id,return_number,return_date,reason,refund_total").eq("original_sale_id", sale.id).order("return_date", { ascending: false }),
    ]);
    const firstError = [lineResult.error,paymentResult.error,returnResult.error].find(Boolean);
    if (firstError) { setError(firstError.message); return; }
    setLines((lineResult.data ?? []).map((line) => ({ ...line, quantity:Number(line.quantity), unit_price:Number(line.unit_price), discount_amount:Number(line.discount_amount), tax_amount:Number(line.tax_amount), line_total:Number(line.line_total), returned_quantity:Number(line.returned_quantity) })) as SaleLine[]);
    setPayments((paymentResult.data ?? []).map((payment) => ({ ...payment, amount:Number(payment.amount) })) as Payment[]);
    setReturns((returnResult.data ?? []).map((entry) => ({ ...entry, refund_total:Number(entry.refund_total) })) as ReturnEntry[]);
  }

  async function cancelHeld() {
    if (!selected) return;
    const reason = window.prompt("Enter cancellation reason:");
    if (!reason?.trim()) return;
    setWorking(true);
    const { error: rpcError } = await createClient().rpc("cancel_held_pos_sale", { p_sale_id:selected.id, p_reason:reason });
    if (rpcError) setError(rpcError.message); else { setSelected(null); await loadSales(); }
    setWorking(false);
  }

  async function completeHeld() {
    if (!selected || !methods.length) return;
    const method = methods.find((item) => item.payment_kind === "cash") ?? methods[0];
    const methodName = window.prompt(`Payment method: type one of ${methods.map((item) => item.name).join(", ")}`, method.name);
    const chosen = methods.find((item) => item.name.toLowerCase() === methodName?.trim().toLowerCase());
    if (!chosen) { setError("Invalid payment method name."); return; }
    const receivedText = chosen.payment_kind === "cash" ? window.prompt("Cash received:", selected.grand_total.toFixed(2)) : selected.grand_total.toFixed(2);
    const received = Number(receivedText);
    if (!Number.isFinite(received) || received < selected.grand_total) { setError("Received amount is invalid."); return; }
    setWorking(true);
    const { error: rpcError } = await createClient().rpc("complete_held_pos_sale", {
      p_sale_id:selected.id,
      p_payments:[{ payment_method_id:chosen.id, amount:selected.grand_total, tendered_amount:chosen.payment_kind === "cash" ? received : null, reference_number:null }],
    });
    if (rpcError) setError(rpcError.message); else { setSelected(null); await loadSales(); }
    setWorking(false);
  }

  async function processReturn() {
    if (!selected) return;
    const selectedLines = lines.flatMap((line) => {
      const quantity = Number(returnQty[line.id] ?? 0);
      return quantity > 0 ? [{ sale_line_id:line.id, quantity, restock:restock[line.id] ?? true }] : [];
    });
    if (!selectedLines.length) { setError("Enter a return quantity for at least one item."); return; }
    if (!returnReason.trim()) { setError("Return reason is required."); return; }
    if (!refundMethodId) { setError("Select a refund method."); return; }
    setWorking(true);
    setError("");
    const { error: rpcError } = await createClient().rpc("return_pos_sale", {
      p_sale_id:selected.id,
      p_lines:selectedLines,
      p_reason:returnReason,
      p_refund_payment_method_id:refundMethodId,
      p_refund_reference:null,
    });
    if (rpcError) { setError(rpcError.message); setWorking(false); return; }
    setSelected(null);
    await loadSales();
    setWorking(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <Link href="/pos" className="inline-flex items-center gap-2 font-semibold text-blue-600"><ArrowLeft size={18}/>Back to POS Billing</Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><h1 className="text-3xl font-bold">POS Sales</h1><p className="mt-1 text-slate-500">Sales history, held bills and customer returns.</p></div>
          <Link href="/pos" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-bold text-white"><ShoppingCart size={18}/>New Sale</Link>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          {[{label:"Transactions",value:summary.count,icon:<ReceiptText/>},{label:"Gross Sales",value:money(summary.completed),icon:<Banknote/>},{label:"Held Bills",value:summary.held,icon:<Pause/>},{label:"Refunded Bills",value:summary.refunds,icon:<RotateCcw/>}].map((card) => <div key={card.label} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3 text-slate-500">{card.icon}<span>{card.label}</span></div><p className="mt-3 text-2xl font-bold">{card.value}</p></div>)}
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-[1fr_210px_170px_170px_auto]">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bill, customer or phone" className="h-11 w-full rounded-xl border bg-white pl-10 pr-3"/></div>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border bg-white px-3"><option value="all">All statuses</option><option value="completed">Completed</option><option value="held">Held</option><option value="partially_refunded">Partially Refunded</option><option value="refunded">Refunded</option><option value="voided">Voided</option></select>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-11 rounded-xl border bg-white px-3"/>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-11 rounded-xl border bg-white px-3"/>
            <button onClick={() => { setSearch("");setStatus("all");setFromDate("");setToDate(""); }} className="h-11 rounded-xl border bg-white px-4 font-semibold">Clear</button>
          </div>
          {error && !selected && <div className="m-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left"><thead className="border-b bg-white text-sm text-slate-500"><tr><th className="px-5 py-4">Bill No.</th><th className="px-5 py-4">Date & Time</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Total</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody className="divide-y">{filtered.map((sale) => { const customer = sale.customer_id ? customerMap.get(sale.customer_id) : null; return <tr key={sale.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-semibold">{sale.sale_number}</td><td className="px-5 py-4 text-sm text-slate-600">{dateTime(sale.sale_date)}</td><td className="px-5 py-4"><p className="font-medium">{customer?.name ?? "Walk-in Customer"}</p>{customer && <p className="text-xs text-slate-500">{customer.phone}</p>}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${badge[sale.status]}`}>{sale.status.replaceAll("_"," ")}</span></td><td className="px-5 py-4 text-right font-bold">{money(sale.grand_total)}</td><td className="px-5 py-4 text-right"><button onClick={() => void openSale(sale)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-white"><Eye size={16}/>View</button></td></tr>; })}</tbody></table>
            {!loading && filtered.length === 0 && <div className="py-20 text-center text-slate-500">No POS sales found.</div>}
            {loading && <div className="py-20 text-center text-slate-500">Loading sales...</div>}
          </div>
        </section>
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between border-b bg-white p-5"><div><h2 className="text-2xl font-bold">{selected.sale_number}</h2><p className="text-sm text-slate-500">{dateTime(selected.sale_date)} · {customerMap.get(selected.customer_id ?? "")?.name ?? "Walk-in Customer"}</p></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><X/></button></div>
        <div className="p-5">
          {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="overflow-hidden rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Item</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Total</th>{returnMode && <th className="p-3">Return</th>}</tr></thead><tbody className="divide-y">{lines.map((line) => { const available = line.quantity-line.returned_quantity; return <tr key={line.id}><td className="p-3"><p className="font-semibold">{productMap.get(line.product_id)?.name ?? line.description}</p><p className="text-xs text-slate-500">{productMap.get(line.product_id)?.sku}{line.returned_quantity > 0 ? ` · ${line.returned_quantity} returned` : ""}</p></td><td className="p-3 text-right">{line.quantity}</td><td className="p-3 text-right">{money(line.unit_price)}</td><td className="p-3 text-right font-semibold">{money(line.line_total)}</td>{returnMode && <td className="p-3"><div className="flex items-center gap-2"><input type="number" min="0" max={available} step="0.001" disabled={available<=0} value={returnQty[line.id] ?? 0} onChange={(event) => setReturnQty((current) => ({...current,[line.id]:Math.min(available,Math.max(0,Number(event.target.value)))}))} className="h-9 w-20 rounded-lg border px-2"/><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={restock[line.id] ?? true} onChange={(event) => setRestock((current) => ({...current,[line.id]:event.target.checked}))}/>Restock</label></div></td>}</tr>; })}</tbody></table></div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><h3 className="font-bold">Payments</h3><div className="mt-2 space-y-2">{payments.map((payment) => <div key={payment.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{methodMap.get(payment.payment_method_id)?.name ?? "Payment"}</span><span className="font-semibold">{money(payment.amount)}</span></div>)}{payments.length===0 && <p className="text-sm text-slate-500">No payments recorded.</p>}</div>{returns.length>0 && <><h3 className="mt-5 font-bold">Returns</h3><div className="mt-2 space-y-2">{returns.map((entry) => <div key={entry.id} className="rounded-lg bg-red-50 p-3 text-sm"><div className="flex justify-between"><span className="font-semibold">{entry.return_number}</span><span className="font-bold text-red-700">{money(entry.refund_total)}</span></div><p className="mt-1 text-red-700">{entry.reason}</p></div>)}</div></>}</div><div className="rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between py-1"><span>Subtotal</span><span>{money(selected.subtotal)}</span></div><div className="flex justify-between py-1"><span>Discounts</span><span>- {money(selected.line_discount_total+selected.bill_discount)}</span></div><div className="flex justify-between py-1"><span>Tax</span><span>{money(selected.tax_total)}</span></div><div className="mt-2 flex justify-between border-t pt-3 text-xl font-bold"><span>Total</span><span>{money(selected.grand_total)}</span></div></div></div>
          {returnMode && <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4"><h3 className="font-bold text-orange-900">Process Return</h3><textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Return reason *" className="mt-3 min-h-20 w-full rounded-xl border bg-white p-3"/><select value={refundMethodId} onChange={(event) => setRefundMethodId(event.target.value)} className="mt-3 h-11 w-full rounded-xl border bg-white px-3">{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select><div className="mt-3 flex justify-end gap-2"><button onClick={() => setReturnMode(false)} className="rounded-xl border bg-white px-4 py-2 font-semibold">Cancel</button><button disabled={working} onClick={() => void processReturn()} className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white disabled:opacity-50">Confirm Return</button></div></div>}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-semibold"><Printer size={17}/>Print</button>{selected.status==="held" && <><button disabled={working} onClick={() => void cancelHeld()} className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-600"><XCircle size={17}/>Cancel Held</button><button disabled={working} onClick={() => void completeHeld()} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">Complete Payment</button></>}{(selected.status==="completed" || selected.status==="partially_refunded") && !returnMode && <button onClick={() => setReturnMode(true)} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 font-bold text-white"><RotateCcw size={17}/>Return Items</button>}</div>
        </div>
      </div></div>}
    </main>
  );
}
