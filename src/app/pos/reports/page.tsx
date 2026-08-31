"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeDollarSign,
  Banknote,
  Download,
  Percent,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Sale = {
  id: string;
  sale_number: string;
  status: string;
  sale_date: string;
  subtotal: number;
  line_discount_total: number;
  bill_discount: number;
  tax_total: number;
  grand_total: number;
};
type Line = { sale_id: string; product_id: string; quantity: number; line_total: number; returned_quantity: number };
type Payment = { sale_id: string; payment_method_id: string; amount: number };
type ReturnRow = { original_sale_id: string; return_date: string; refund_total: number };
type Product = { id: string; name: string; sku: string };
type Method = { id: string; name: string };

const today = new Date().toISOString().slice(0,10);
const monthStart = `${today.slice(0,8)}01`;
const money = (value: number) => new Intl.NumberFormat("en-LK", { style:"currency",currency:"LKR",minimumFractionDigits:2 }).format(value);

export default function PosReportsPage() {
  const [sales,setSales] = useState<Sale[]>([]);
  const [lines,setLines] = useState<Line[]>([]);
  const [payments,setPayments] = useState<Payment[]>([]);
  const [returns,setReturns] = useState<ReturnRow[]>([]);
  const [products,setProducts] = useState<Product[]>([]);
  const [methods,setMethods] = useState<Method[]>([]);
  const [fromDate,setFromDate] = useState(monthStart);
  const [toDate,setToDate] = useState(today);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase=createClient();
      const [saleResult,lineResult,paymentResult,returnResult,productResult,methodResult]=await Promise.all([
        supabase.from("pos_sales").select("id,sale_number,status,sale_date,subtotal,line_discount_total,bill_discount,tax_total,grand_total").order("sale_date",{ascending:false}).limit(3000),
        supabase.from("pos_sale_lines").select("sale_id,product_id,quantity,line_total,returned_quantity").limit(10000),
        supabase.from("pos_sale_payments").select("sale_id,payment_method_id,amount").limit(10000),
        supabase.from("pos_returns").select("original_sale_id,return_date,refund_total").limit(5000),
        supabase.from("products").select("id,name,sku"),
        supabase.from("pos_payment_methods").select("id,name"),
      ]);
      const firstError=[saleResult.error,lineResult.error,paymentResult.error,returnResult.error,productResult.error,methodResult.error].find(Boolean);
      if(firstError)setError(firstError.message);
      setSales((saleResult.data??[]).map((row)=>({...row,subtotal:Number(row.subtotal),line_discount_total:Number(row.line_discount_total),bill_discount:Number(row.bill_discount),tax_total:Number(row.tax_total),grand_total:Number(row.grand_total)})) as Sale[]);
      setLines((lineResult.data??[]).map((row)=>({...row,quantity:Number(row.quantity),line_total:Number(row.line_total),returned_quantity:Number(row.returned_quantity)})) as Line[]);
      setPayments((paymentResult.data??[]).map((row)=>({...row,amount:Number(row.amount)})) as Payment[]);
      setReturns((returnResult.data??[]).map((row)=>({...row,refund_total:Number(row.refund_total)})) as ReturnRow[]);
      setProducts((productResult.data??[]) as Product[]);
      setMethods((methodResult.data??[]) as Method[]);
      setLoading(false);
    }
    void load();
  },[]);

  const report=useMemo(()=>{
    const periodSales=sales.filter((sale)=>{
      const day=sale.sale_date.slice(0,10);
      return day>=fromDate&&day<=toDate&&!["held","voided"].includes(sale.status);
    });
    const saleIds=new Set(periodSales.map((sale)=>sale.id));
    const periodReturns=returns.filter((entry)=>entry.return_date.slice(0,10)>=fromDate&&entry.return_date.slice(0,10)<=toDate);
    const gross=periodSales.reduce((sum,sale)=>sum+sale.grand_total,0);
    const refundTotal=periodReturns.reduce((sum,entry)=>sum+entry.refund_total,0);
    const discounts=periodSales.reduce((sum,sale)=>sum+sale.line_discount_total+sale.bill_discount,0);
    const tax=periodSales.reduce((sum,sale)=>sum+sale.tax_total,0);
    const methodMap=new Map(methods.map((method)=>[method.id,method.name]));
    const paymentTotals=new Map<string,number>();
    for(const payment of payments.filter((payment)=>saleIds.has(payment.sale_id))){
      const name=methodMap.get(payment.payment_method_id)??"Other";
      paymentTotals.set(name,(paymentTotals.get(name)??0)+payment.amount);
    }
    const productMap=new Map(products.map((product)=>[product.id,product]));
    const productTotals=new Map<string,{name:string;sku:string;qty:number;value:number}>();
    for(const line of lines.filter((line)=>saleIds.has(line.sale_id))){
      const product=productMap.get(line.product_id);
      const current=productTotals.get(line.product_id)??{name:product?.name??"Unknown product",sku:product?.sku??"—",qty:0,value:0};
      current.qty+=Math.max(0,line.quantity-line.returned_quantity);
      current.value+=line.line_total;
      productTotals.set(line.product_id,current);
    }
    return{
      sales:periodSales,
      gross,
      refunds:refundTotal,
      net:gross-refundTotal,
      discounts,
      tax,
      average:periodSales.length?gross/periodSales.length:0,
      payments:[...paymentTotals].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
      products:[...productTotals.values()].sort((a,b)=>b.qty-a.qty).slice(0,15),
    };
  },[sales,lines,payments,returns,products,methods,fromDate,toDate]);

  function exportCsv(){
    const rows=[["POS Sales Report"],["From",fromDate],["To",toDate],[],["Summary","Amount"],["Gross Sales",report.gross],["Refunds",report.refunds],["Net Sales",report.net],["Discounts",report.discounts],["Tax",report.tax],[],["Payment Method","Amount"],...report.payments.map((row)=>[row.name,row.value]),[],["Product","SKU","Quantity","Sales Value"],...report.products.map((row)=>[row.name,row.sku,row.qty,row.value])];
    const csv=rows.map((row)=>row.map((cell)=>`"${String(cell??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=`pos-report-${fromDate}-to-${toDate}.csv`;anchor.click();URL.revokeObjectURL(url);
  }

  return <main className="min-h-screen bg-slate-100 p-4 sm:p-8 text-slate-950"><div className="mx-auto max-w-7xl">
    <Link href="/pos" className="inline-flex items-center gap-2 font-semibold text-blue-600"><ArrowLeft size={18}/>Back to POS Billing</Link>
    <div className="mt-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><h1 className="text-3xl font-bold">POS Sales Report</h1><p className="mt-1 text-slate-500">Sales performance, payments, refunds and product analysis.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-sm font-semibold">From<input type="date" value={fromDate} onChange={(event)=>setFromDate(event.target.value)} className="mt-1 block h-11 rounded-xl border bg-white px-3 font-normal"/></label><label className="text-sm font-semibold">To<input type="date" value={toDate} onChange={(event)=>setToDate(event.target.value)} className="mt-1 block h-11 rounded-xl border bg-white px-3 font-normal"/></label><button onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 font-bold text-white"><Download size={18}/>Export CSV</button></div></div>
    {error&&<div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    {loading?<div className="mt-6 rounded-2xl border bg-white py-24 text-center text-slate-500">Loading report...</div>:<>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[
        {label:"Transactions",value:report.sales.length,icon:<ReceiptText/>,color:"text-slate-700 bg-slate-100"},
        {label:"Gross Sales",value:money(report.gross),icon:<TrendingUp/>,color:"text-blue-700 bg-blue-50"},
        {label:"Refunds",value:money(report.refunds),icon:<RotateCcw/>,color:"text-red-700 bg-red-50"},
        {label:"Net Sales",value:money(report.net),icon:<BadgeDollarSign/>,color:"text-emerald-700 bg-emerald-50"},
        {label:"Discounts",value:money(report.discounts),icon:<Percent/>,color:"text-orange-700 bg-orange-50"},
        {label:"Average Bill",value:money(report.average),icon:<ShoppingBag/>,color:"text-violet-700 bg-violet-50"},
      ].map((card)=><div key={card.label} className="rounded-2xl border bg-white p-5 shadow-sm"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.color}`}>{card.icon}</div><p className="mt-3 text-sm text-slate-500">{card.label}</p><p className="mt-1 truncate text-xl font-bold">{card.value}</p></div>)}</section>
      <section className="mt-5 grid gap-5 lg:grid-cols-[420px_1fr]">
        <div className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Payment Breakdown</h2><p className="text-sm text-slate-500">Collected amounts by payment method.</p><div className="mt-5 space-y-3">{report.payments.map((row)=>{const percentage=report.gross?Math.min(100,row.value/report.gross*100):0;return <div key={row.name}><div className="flex justify-between text-sm"><span className="font-medium">{row.name}</span><span className="font-bold">{money(row.value)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${percentage}%`}}/></div></div>})}{report.payments.length===0&&<p className="py-10 text-center text-slate-500">No payment data for this period.</p>}</div><div className="mt-6 flex justify-between border-t pt-4 font-bold"><span>Tax Collected</span><span>{money(report.tax)}</span></div></div>
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b p-6"><h2 className="text-xl font-bold">Top Selling Products</h2><p className="text-sm text-slate-500">Ranked by net quantity sold.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead className="border-b bg-slate-50 text-sm text-slate-500"><tr><th className="px-5 py-4">Rank</th><th className="px-5 py-4">Product</th><th className="px-5 py-4 text-right">Net Qty</th><th className="px-5 py-4 text-right">Sales Value</th></tr></thead><tbody className="divide-y">{report.products.map((row,index)=><tr key={`${row.sku}-${index}`}><td className="px-5 py-4 font-bold text-blue-600">#{index+1}</td><td className="px-5 py-4"><p className="font-semibold">{row.name}</p><p className="text-xs text-slate-500">{row.sku}</p></td><td className="px-5 py-4 text-right font-semibold">{row.qty}</td><td className="px-5 py-4 text-right font-bold">{money(row.value)}</td></tr>)}</tbody></table>{report.products.length===0&&<div className="py-16 text-center text-slate-500">No product sales for this period.</div>}</div></div>
      </section>
    </>}
  </div></main>;
}
