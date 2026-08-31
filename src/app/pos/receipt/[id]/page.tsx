"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Sale = {
  id: string;
  business_id: string;
  branch_id: string;
  customer_id: string | null;
  sale_number: string;
  status: string;
  sale_date: string;
  subtotal: number;
  line_discount_total: number;
  bill_discount: number;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change_amount: number;
};

type Line = {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  line_total: number;
};

type Payment = {
  id: string;
  amount: number;
  tendered_amount: number | null;
  reference_number: string | null;
  payment_method_id: string;
};

type NamedRecord = { id: string; name: string };
type Business = NamedRecord & { phone: string | null; address: string | null };

const money = (value: number) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export default function PosReceiptPage() {
  const params = useParams<{ id: string }>();
  const [sale, setSale] = useState<Sale | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [methods, setMethods] = useState<NamedRecord[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [branch, setBranch] = useState<NamedRecord | null>(null);
  const [customer, setCustomer] = useState<NamedRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadReceipt() {
      setLoading(true);
      setError("");
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        window.location.href = "/login";
        return;
      }

      const { data: saleData, error: saleError } = await supabase
        .from("pos_sales")
        .select("id,business_id,branch_id,customer_id,sale_number,status,sale_date,subtotal,line_discount_total,bill_discount,tax_total,grand_total,paid_total,change_amount")
        .eq("id", params.id)
        .single();

      if (saleError || !saleData) {
        setError(saleError?.message || "Receipt was not found.");
        setLoading(false);
        return;
      }

      const [lineResult, paymentResult, methodResult, businessResult, branchResult] =
        await Promise.all([
          supabase.from("pos_sale_lines").select("id,description,quantity,unit_price,discount_amount,tax_amount,line_total").eq("sale_id", saleData.id).order("id"),
          supabase.from("pos_sale_payments").select("id,amount,tendered_amount,reference_number,payment_method_id").eq("sale_id", saleData.id).order("paid_at"),
          supabase.from("pos_payment_methods").select("id,name").eq("business_id", saleData.business_id),
          supabase.from("businesses").select("id,name,phone,address").eq("id", saleData.business_id).single(),
          supabase.from("branches").select("id,name").eq("id", saleData.branch_id).single(),
        ]);

      if (lineResult.error || paymentResult.error) {
        setError(lineResult.error?.message || paymentResult.error?.message || "Receipt details could not be loaded.");
        setLoading(false);
        return;
      }

      let customerData: NamedRecord | null = null;
      if (saleData.customer_id) {
        const result = await supabase
          .from("customers")
          .select("id,name")
          .eq("id", saleData.customer_id)
          .single();
        customerData = result.data;
      }

      setSale(saleData as Sale);
      setLines((lineResult.data || []) as Line[]);
      setPayments((paymentResult.data || []) as Payment[]);
      setMethods((methodResult.data || []) as NamedRecord[]);
      setBusiness(businessResult.data as Business | null);
      setBranch(branchResult.data as NamedRecord | null);
      setCustomer(customerData);
      setLoading(false);
    }

    if (params.id) loadReceipt();
  }, [params.id]);

  const methodName = (id: string) => methods.find((method) => method.id === id)?.name || "Payment";

  if (loading) return <main className="p-10 text-center text-slate-500">Loading receipt...</main>;
  if (error || !sale) return <main className="mx-auto max-w-lg p-10 text-center"><p className="rounded-xl bg-red-50 p-4 text-red-700">{error || "Receipt was not found."}</p><Link href="/pos/sales" className="mt-5 inline-block text-blue-600">Back to POS sales</Link></main>;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-md items-center justify-between">
        <Link href="/pos/sales" className="inline-flex items-center gap-2 font-medium text-slate-600"><ArrowLeft size={18} /> Back to sales</Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"><Printer size={18} /> Print</button>
      </div>

      <article className="receipt mx-auto max-w-md bg-white p-7 text-slate-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b border-dashed border-slate-400 pb-4 text-center">
          <h1 className="text-2xl font-bold">{business?.name || "POS Receipt"}</h1>
          {business?.address && <p className="mt-1 text-sm">{business.address}</p>}
          {business?.phone && <p className="text-sm">Tel: {business.phone}</p>}
          {branch?.name && <p className="mt-1 text-sm font-medium">{branch.name}</p>}
        </header>

        <section className="border-b border-dashed border-slate-400 py-4 text-sm">
          <div className="flex justify-between gap-3"><span>Receipt</span><strong>{sale.sale_number}</strong></div>
          <div className="mt-1 flex justify-between gap-3"><span>Date</span><span>{new Date(sale.sale_date).toLocaleString("en-LK")}</span></div>
          <div className="mt-1 flex justify-between gap-3"><span>Customer</span><span>{customer?.name || "Walk-in Customer"}</span></div>
          <div className="mt-1 flex justify-between gap-3"><span>Status</span><span className="capitalize">{sale.status.replaceAll("_", " ")}</span></div>
        </section>

        <section className="border-b border-dashed border-slate-400 py-4">
          {lines.map((line) => (
            <div key={line.id} className="mb-3 last:mb-0">
              <div className="font-medium">{line.description || "Product"}</div>
              <div className="mt-1 flex justify-between text-sm"><span>{Number(line.quantity)} × {money(line.unit_price)}</span><strong>{money(line.line_total)}</strong></div>
              {Number(line.discount_amount) > 0 && <div className="text-xs text-slate-500">Discount: {money(line.discount_amount)}</div>}
            </div>
          ))}
        </section>

        <section className="border-b border-dashed border-slate-400 py-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
          {Number(sale.line_discount_total) > 0 && <div className="mt-1 flex justify-between"><span>Line discounts</span><span>- {money(sale.line_discount_total)}</span></div>}
          {Number(sale.bill_discount) > 0 && <div className="mt-1 flex justify-between"><span>Bill discount</span><span>- {money(sale.bill_discount)}</span></div>}
          {Number(sale.tax_total) > 0 && <div className="mt-1 flex justify-between"><span>Tax</span><span>{money(sale.tax_total)}</span></div>}
          <div className="mt-3 flex justify-between border-t border-slate-300 pt-3 text-xl font-bold"><span>Total</span><span>{money(sale.grand_total)}</span></div>
        </section>

        <section className="border-b border-dashed border-slate-400 py-4 text-sm">
          <h2 className="mb-2 font-bold">Payments</h2>
          {payments.length === 0 ? <p>Not paid</p> : payments.map((payment) => (
            <div key={payment.id} className="mb-1 flex justify-between gap-3"><span>{methodName(payment.payment_method_id)}{payment.reference_number ? ` (${payment.reference_number})` : ""}</span><span>{money(payment.amount)}</span></div>
          ))}
          {Number(sale.change_amount) > 0 && <div className="mt-2 flex justify-between font-medium"><span>Change</span><span>{money(sale.change_amount)}</span></div>}
        </section>

        <footer className="pt-5 text-center text-sm"><p className="font-semibold">Thank you for your purchase!</p><p className="mt-1 text-xs text-slate-500">Please keep this receipt for your records.</p></footer>
      </article>

      <style jsx global>{`
        @media print {
          @page { size: 80mm auto; margin: 5mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .receipt { width: 70mm; font-size: 12px; }
        }
      `}</style>
    </main>
  );
}
