"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Save, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;
};

export default function NewStockAdjustmentPage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [branchId, setBranchId] = useState("");
  const [productId, setProductId] = useState("");
  const [adjustmentType, setAdjustmentType] =
    useState("adjustment_in");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");

  const [currentQuantity, setCurrentQuantity] = useState(0);
  const [currentCost, setCurrentCost] = useState(0);

  const [loading, setLoading] = useState(true);
  const [checkingStock, setCheckingStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMasterData() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const [branchResult, productResult] = await Promise.all([
        supabase
          .from("branches")
          .select("id, name")
          .eq("active", true)
          .order("name"),

        supabase
          .from("products")
          .select("id, sku, name")
          .eq("product_type", "stockable")
          .eq("active", true)
          .order("name"),
      ]);

      if (branchResult.error) {
        setError(branchResult.error.message);
        setLoading(false);
        return;
      }

      if (productResult.error) {
        setError(productResult.error.message);
        setLoading(false);
        return;
      }

      setBranches((branchResult.data ?? []) as Branch[]);
      setProducts((productResult.data ?? []) as Product[]);

      if (branchResult.data?.length === 1) {
        setBranchId(branchResult.data[0].id);
      }

      setLoading(false);
    }

    loadMasterData();
  }, []);

  useEffect(() => {
    async function loadCurrentStock() {
      if (!branchId || !productId) {
        setCurrentQuantity(0);
        setCurrentCost(0);
        return;
      }

      setCheckingStock(true);

      const { data, error: stockError } = await supabase
        .from("stock_balances")
        .select("quantity, average_cost")
        .eq("branch_id", branchId)
        .eq("product_id", productId)
        .maybeSingle();

      if (stockError) {
        setError(stockError.message);
        setCheckingStock(false);
        return;
      }

      setCurrentQuantity(Number(data?.quantity ?? 0));
      setCurrentCost(Number(data?.average_cost ?? 0));
      setCheckingStock(false);
    }

    loadCurrentStock();
  }, [branchId, productId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const enteredQuantity = Number(quantity);
    const enteredUnitCost = unitCost === "" ? null : Number(unitCost);

    if (!branchId) {
      setError("Please select a branch.");
      return;
    }

    if (!productId) {
      setError("Please select a stock product.");
      return;
    }

    if (!Number.isFinite(enteredQuantity) || enteredQuantity <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    if (
      enteredUnitCost !== null &&
      (!Number.isFinite(enteredUnitCost) || enteredUnitCost < 0)
    ) {
      setError("Unit cost cannot be negative.");
      return;
    }

    if (!reason.trim()) {
      setError("Adjustment reason is required.");
      return;
    }

    if (
      adjustmentType === "adjustment_out" &&
      enteredQuantity > currentQuantity
    ) {
      setError(
        `Insufficient stock. Available quantity is ${currentQuantity}.`
      );
      return;
    }

    setSaving(true);

    const { data, error: rpcError } = await supabase.rpc(
      "adjust_inventory",
      {
        p_branch_id: branchId,
        p_product_id: productId,
        p_adjustment_type: adjustmentType,
        p_quantity: enteredQuantity,
        p_unit_cost: enteredUnitCost,
        p_reason: reason.trim(),
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    const reference =
      data?.reference_number ?? "Inventory adjustment";

    window.alert(`${reference} saved successfully.`);
    window.location.href = "/inventory/movements";
  }

  const money = (value: number) =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2,
    }).format(value);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading adjustment form...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <Link
            href="/inventory"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft size={18} />
            Back to Inventory
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <SlidersHorizontal size={24} />
            </div>

            <div>
              <h1 className="text-3xl font-bold">New Stock Adjustment</h1>
              <p className="mt-1 text-slate-500">
                Correct stock quantities and record the adjustment reason.
              </p>
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-bold">Adjustment Details</h2>
            <p className="mt-1 text-sm text-slate-500">
              All fields marked with * are required.
            </p>
          </div>

          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Branch *
              </span>

              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                required
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select branch</option>

                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Stock Product *
              </span>

              <select
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                required
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select product</option>

                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Adjustment Type *
              </span>

              <select
                value={adjustmentType}
                onChange={(event) =>
                  setAdjustmentType(event.target.value)
                }
                required
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="adjustment_in">
                  Stock In / Increase
                </option>

                <option value="adjustment_out">
                  Stock Out / Decrease
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Quantity *
              </span>

              <input
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                min="0.001"
                step="0.001"
                required
                placeholder="0.000"
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-semibold">
                Unit Cost
              </span>

              <input
                type="number"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                min="0"
                step="0.01"
                placeholder={
                  adjustmentType === "adjustment_in"
                    ? "Enter cost for stock-in"
                    : "Current average cost will be used"
                }
                disabled={adjustmentType === "adjustment_out"}
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none disabled:bg-slate-100 disabled:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <p className="mt-2 text-xs text-slate-500">
                For Stock Out, the current average cost is used automatically.
              </p>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-semibold">
                Adjustment Reason *
              </span>

              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={500}
                rows={4}
                placeholder="Example: Opening balance, damaged stock, expired items or physical count correction"
                className="w-full rounded-xl border border-slate-300 p-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <p className="mt-2 text-right text-xs text-slate-400">
                {reason.length}/500
              </p>
            </label>
          </div>

          <div className="mx-6 mb-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-slate-500">
                Current Quantity
              </p>
              <p className="mt-1 text-xl font-bold">
                {checkingStock
                  ? "Checking..."
                  : currentQuantity.toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase text-slate-500">
                Current Average Cost
              </p>
              <p className="mt-1 text-xl font-bold">
                {checkingStock ? "Checking..." : money(currentCost)}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase text-slate-500">
                Expected New Quantity
              </p>
              <p className="mt-1 text-xl font-bold text-blue-600">
                {quantity
                  ? (
                      currentQuantity +
                      (adjustmentType === "adjustment_in"
                        ? Number(quantity)
                        : -Number(quantity))
                    ).toLocaleString()
                  : currentQuantity.toLocaleString()}
              </p>
            </div>
          </div>

          {error && (
            <div className="mx-6 mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 p-6 sm:flex-row sm:justify-end">
            <Link
              href="/inventory"
              className="flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 font-semibold hover:bg-slate-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving || checkingStock}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={19} />
              {saving ? "Saving..." : "Save Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
