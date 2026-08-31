"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  CreditCard,
  Minus,
  Package,
  Pause,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category_id: string | null;
  product_type: "stockable" | "service";
  selling_price: number;
  image_url: string | null;
  stock: number;
};

type Category = { id: string; name: string };
type Customer = { id: string; code: string; name: string; phone: string };
type PaymentMethod = {
  id: string;
  name: string;
  payment_kind: "cash" | "card" | "bank_transfer" | "credit" | "other";
};

type CartLine = Product & {
  quantity: number;
  discountPercent: number;
  taxPercent: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(value);

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [customerId, setCustomerId] = useState("");
  const [billDiscount, setBillDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [tendered, setTendered] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [lastReceipt, setLastReceipt] = useState<{
    number: string;
    total: number;
    lines: CartLine[];
  } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const [productResult, categoryResult, customerResult, methodResult, balanceResult, sessionResult] =
      await Promise.all([
        supabase
          .from("products")
          .select("id,name,sku,barcode,category_id,product_type,selling_price,image_url")
          .eq("active", true)
          .order("name"),
        supabase.from("product_categories").select("id,name").eq("active", true).order("name"),
        supabase.from("customers").select("id,code,name,phone").eq("active", true).order("name"),
        supabase
          .from("pos_payment_methods")
          .select("id,name,payment_kind")
          .eq("active", true)
          .order("name"),
        supabase.from("stock_balances").select("product_id,quantity"),
        supabase
          .from("pos_sessions")
          .select("id")
          .eq("cashier_id", user.id)
          .eq("status", "open")
          .maybeSingle(),
      ]);

    const firstError = [
      productResult.error,
      categoryResult.error,
      customerResult.error,
      methodResult.error,
      balanceResult.error,
      sessionResult.error,
    ].find(Boolean);

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const stockMap = new Map<string, number>();
    for (const row of balanceResult.data ?? []) {
      stockMap.set(row.product_id, (stockMap.get(row.product_id) ?? 0) + Number(row.quantity));
    }

    setProducts(
      (productResult.data ?? []).map((product) => ({
        ...product,
        selling_price: Number(product.selling_price),
        stock: stockMap.get(product.id) ?? 0,
      })) as Product[],
    );
    setCategories((categoryResult.data ?? []) as Category[]);
    setCustomers((customerResult.data ?? []) as Customer[]);
    setPaymentMethods((methodResult.data ?? []) as PaymentMethod[]);
    setSessionId(sessionResult.data?.id ?? null);
    setShowOpenSession(!sessionResult.data?.id);

    const cashMethod = (methodResult.data ?? []).find(
      (method) => method.payment_kind === "cash",
    );
    setPaymentMethodId(cashMethod?.id ?? methodResult.data?.[0]?.id ?? "");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "all" || product.category_id === category;
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.barcode?.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [products, category, search]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let lineDiscount = 0;
    let tax = 0;
    for (const line of cart) {
      const base = line.quantity * line.selling_price;
      const discount = (base * line.discountPercent) / 100;
      subtotal += base;
      lineDiscount += discount;
      tax += ((base - discount) * line.taxPercent) / 100;
    }
    const total = Math.max(0, subtotal - lineDiscount + tax - billDiscount);
    return { subtotal, lineDiscount, tax, total };
  }, [cart, billDiscount]);

  const selectedPayment = paymentMethods.find((method) => method.id === paymentMethodId);
  const cashReceived = Number(tendered || 0);
  const change = selectedPayment?.payment_kind === "cash"
    ? Math.max(0, cashReceived - totals.total)
    : 0;

  function addProduct(product: Product) {
    setError("");
    if (product.product_type === "stockable" && product.stock <= 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }

    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        if (product.product_type === "stockable" && existing.quantity >= product.stock) {
          setError(`Only ${product.stock} available for ${product.name}.`);
          return current;
        }
        return current.map((line) =>
          line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { ...product, quantity: 1, discountPercent: 0, taxPercent: 0 }];
    });
  }

  function changeQuantity(productId: string, amount: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.id !== productId) return line;
          const quantity = line.quantity + amount;
          if (line.product_type === "stockable" && quantity > line.stock) {
            setError(`Only ${line.stock} available for ${line.name}.`);
            return line;
          }
          return { ...line, quantity };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  async function openSession(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("open_pos_session", {
      p_opening_balance: Number(openingBalance || 0),
      p_notes: null,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSessionId(data);
      setShowOpenSession(false);
    }
    setWorking(false);
  }

  async function saveSale(hold: boolean) {
    if (!sessionId || cart.length === 0) return;
    if (!hold && !paymentMethodId) {
      setError("Select a payment method.");
      return;
    }
    if (
      !hold &&
      selectedPayment?.payment_kind === "cash" &&
      cashReceived < totals.total
    ) {
      setError("Cash received is less than the bill total.");
      return;
    }

    setWorking(true);
    setError("");
    const supabase = createClient();
    const paymentPayload = hold
      ? []
      : [
          {
            payment_method_id: paymentMethodId,
            amount: Number(totals.total.toFixed(2)),
            tendered_amount:
              selectedPayment?.payment_kind === "cash" ? cashReceived : null,
            reference_number: paymentReference || null,
          },
        ];

    const { data, error: rpcError } = await supabase.rpc("create_pos_sale", {
      p_session_id: sessionId,
      p_customer_id: customerId || null,
      p_lines: cart.map((line) => ({
        product_id: line.id,
        quantity: line.quantity,
        unit_price: line.selling_price,
        discount_percent: line.discountPercent,
        tax_percent: line.taxPercent,
      })),
      p_payments: paymentPayload,
      p_bill_discount: billDiscount,
      p_notes: null,
      p_hold: hold,
    });

    if (rpcError) {
      setError(rpcError.message);
      setWorking(false);
      return;
    }

    const receiptLines = [...cart];
    setCart([]);
    setBillDiscount(0);
    setCustomerId("");
    setTendered("");
    setPaymentReference("");
    setShowPayment(false);
    if (!hold) {
      setLastReceipt({ number: String(data).slice(0, 8).toUpperCase(), total: totals.total, lines: receiptLines });
    }
    await load();
    setWorking(false);
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">Loading POS...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title="Back to dashboard">
              <ArrowLeft size={22} />
            </Link>
            <div>
              <h1 className="text-xl font-bold">POS Billing</h1>
              <p className="text-xs text-slate-500">New retail sale</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${sessionId ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {sessionId ? "Session Open" : "Session Required"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="min-w-0 rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product name, SKU or scan barcode"
                className="h-12 w-full rounded-xl border border-slate-300 pl-12 pr-12 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <Barcode className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setCategory("all")} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${category === "all" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>All Products</button>
              {categories.map((item) => (
                <button key={item.id} onClick={() => setCategory(item.id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${category === item.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{item.name}</button>
              ))}
            </div>
          </div>

          {error && <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="grid max-h-[calc(100vh-210px)] grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredProducts.map((product) => {
              const unavailable = product.product_type === "stockable" && product.stock <= 0;
              return (
                <button key={product.id} disabled={unavailable} onClick={() => addProduct(product)} className="overflow-hidden rounded-xl border bg-white text-left transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">
                  <div className="flex h-28 items-center justify-center bg-slate-100">
                    {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="text-slate-300" size={42} />}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 min-h-10 text-sm font-semibold">{product.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{product.sku}</p>
                    <p className="mt-2 font-bold text-blue-600">{money(product.selling_price)}</p>
                    <p className={`mt-1 text-xs ${unavailable ? "text-red-600" : "text-slate-500"}`}>
                      {product.product_type === "service" ? "Service" : `${product.stock} in stock`}
                    </p>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && <div className="col-span-full py-20 text-center text-slate-500">No products found.</div>}
          </div>
        </section>

        <aside className="flex min-h-[calc(100vh-105px)] flex-col rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><ShoppingCart size={21} /><h2 className="font-bold">Current Bill</h2></div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{cart.length} items</span>
            </div>
            <div className="relative mt-3">
              <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 outline-none focus:border-blue-500">
                <option value="">Walk-in Customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.phone}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {cart.map((line) => (
              <div key={line.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold">{line.name}</p><p className="text-sm text-slate-500">{money(line.selling_price)} each</p></div>
                  <button onClick={() => setCart((current) => current.filter((item) => item.id !== line.id))} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={17} /></button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center rounded-lg border">
                    <button onClick={() => changeQuantity(line.id,-1)} className="p-2 hover:bg-slate-50"><Minus size={16} /></button>
                    <span className="min-w-10 text-center font-semibold">{line.quantity}</span>
                    <button onClick={() => changeQuantity(line.id,1)} className="p-2 hover:bg-slate-50"><Plus size={16} /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">Disc.%</label>
                    <input type="number" min="0" max="100" value={line.discountPercent} onChange={(event) => setCart((current) => current.map((item) => item.id === line.id ? { ...item, discountPercent: Math.min(100,Math.max(0,Number(event.target.value))) } : item))} className="h-9 w-16 rounded-lg border px-2 text-right" />
                  </div>
                  <p className="font-bold">{money(line.quantity * line.selling_price * (1-line.discountPercent/100))}</p>
                </div>
              </div>
            ))}
            {cart.length === 0 && <div className="flex h-full min-h-64 flex-col items-center justify-center text-center text-slate-400"><ShoppingCart size={48} /><p className="mt-3 font-semibold text-slate-600">Cart is empty</p><p className="text-sm">Select a product to start billing.</p></div>}
          </div>

          <div className="border-t bg-slate-50 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>{money(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Line discounts</span><span>- {money(totals.lineDiscount)}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-600">Bill discount</span><input type="number" min="0" value={billDiscount} onChange={(event) => setBillDiscount(Math.max(0,Number(event.target.value)))} className="h-9 w-32 rounded-lg border bg-white px-2 text-right" /></div>
              <div className="flex justify-between"><span className="text-slate-600">Tax</span><span>{money(totals.tax)}</span></div>
              <div className="mt-2 flex justify-between border-t pt-3 text-xl font-bold"><span>Total</span><span className="text-blue-600">{money(totals.total)}</span></div>
            </div>
            <div className="mt-4 grid grid-cols-[130px_1fr] gap-2">
              <button disabled={!cart.length || working} onClick={() => void saveSale(true)} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-semibold hover:bg-slate-50 disabled:opacity-50"><Pause size={18} />Hold</button>
              <button disabled={!cart.length || !sessionId || working} onClick={() => { setTendered(totals.total.toFixed(2)); setShowPayment(true); }} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Banknote size={20} />Pay {money(totals.total)}</button>
            </div>
          </div>
        </aside>
      </div>

      {showOpenSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={openSession} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Banknote /></div>
            <h2 className="mt-4 text-2xl font-bold">Open POS Session</h2>
            <p className="mt-1 text-slate-500">Enter the cash available in the drawer before starting sales.</p>
            <label className="mt-5 block text-sm font-semibold">Opening cash balance</label>
            <input type="number" min="0" step="0.01" required value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4 text-lg outline-none focus:border-blue-500" />
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={working} className="mt-5 h-12 w-full rounded-xl bg-blue-600 font-bold text-white disabled:opacity-50">{working ? "Opening..." : "Open Session"}</button>
          </form>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-2xl font-bold">Complete Payment</h2><button onClick={() => setShowPayment(false)} className="rounded-lg p-2 hover:bg-slate-100"><X /></button></div>
            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-center"><p className="text-sm text-blue-700">Amount to pay</p><p className="text-3xl font-bold text-blue-700">{money(totals.total)}</p></div>
            <label className="mt-5 block text-sm font-semibold">Payment method</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => (
                <button key={method.id} onClick={() => { setPaymentMethodId(method.id); if (method.payment_kind !== "cash") setTendered(totals.total.toFixed(2)); }} className={`flex h-12 items-center justify-center gap-2 rounded-xl border font-semibold ${paymentMethodId === method.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300"}`}>
                  {method.payment_kind === "cash" ? <Banknote size={18} /> : <CreditCard size={18} />}{method.name}
                </button>
              ))}
            </div>
            {selectedPayment?.payment_kind === "cash" && <><label className="mt-4 block text-sm font-semibold">Cash received</label><input type="number" min={totals.total} step="0.01" value={tendered} onChange={(event) => setTendered(event.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4 text-lg" /><div className="mt-3 flex justify-between rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-700"><span>Change</span><span>{money(change)}</span></div></>}
            {selectedPayment?.payment_kind !== "cash" && <><label className="mt-4 block text-sm font-semibold">Payment reference (optional)</label><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Card slip or bank reference" className="mt-2 h-12 w-full rounded-xl border px-4" /></>}
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={working} onClick={() => void saveSale(false)} className="mt-5 h-13 w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50">{working ? "Processing..." : "Complete Sale"}</button>
          </div>
        </div>
      )}

      {lastReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Printer /></div><h2 className="mt-3 text-2xl font-bold">Sale Completed</h2><p className="text-slate-500">Receipt #{lastReceipt.number}</p></div>
            <div className="mt-5 max-h-52 space-y-2 overflow-y-auto border-y py-4 text-sm">{lastReceipt.lines.map((line) => <div key={line.id} className="flex justify-between gap-4"><span>{line.name} × {line.quantity}</span><span>{money(line.quantity*line.selling_price*(1-line.discountPercent/100))}</span></div>)}</div>
            <div className="mt-4 flex justify-between text-xl font-bold"><span>Total</span><span>{money(lastReceipt.total)}</span></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => window.print()} className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold"><Printer size={18} />Print</button><button onClick={() => setLastReceipt(null)} className="h-11 rounded-xl bg-blue-600 font-bold text-white">New Sale</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
