import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  History,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{
  search?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
}>;

type Movement = {
  id: string;
  branch_id: string;
  product_id: string;
  movement_type: string;
  quantity: number | string;
  unit_cost: number | string;
  reference_type: string | null;
  reference_number: string | null;
  movement_date: string;
  created_at: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;
};

type Branch = {
  id: string;
  name: string;
};

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = await searchParams;

  const search = filters.search?.trim().toLowerCase() ?? "";
  const movementType = filters.type ?? "all";
  const dateFrom = filters.date_from ?? "";
  const dateTo = filters.date_to ?? "";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_id")
    .eq("id", user!.id)
    .single();

  const businessId = profile?.business_id;

  let query = supabase
    .from("stock_movements")
    .select(
      `
        id,
        branch_id,
        product_id,
        movement_type,
        quantity,
        unit_cost,
        reference_type,
        reference_number,
        movement_date,
        created_at
      `
    )
    .eq("business_id", businessId);

  if (movementType !== "all") {
    query = query.eq("movement_type", movementType);
  }

  if (dateFrom) {
    query = query.gte("movement_date", dateFrom);
  }

  if (dateTo) {
    query = query.lte("movement_date", dateTo);
  }

  const { data: movementData, error } = await query
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false });

  const rawMovements = (movementData ?? []) as Movement[];

  const productIds = [...new Set(rawMovements.map((item) => item.product_id))];
  const branchIds = [...new Set(rawMovements.map((item) => item.branch_id))];

  let products: Product[] = [];
  let branches: Branch[] = [];

  if (productIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, sku, name")
      .in("id", productIds);

    products = (data ?? []) as Product[];
  }

  if (branchIds.length > 0) {
    const { data } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);

    branches = (data ?? []) as Branch[];
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]));

  const movements = rawMovements
    .map((movement) => {
      const product = productMap.get(movement.product_id);
      const branch = branchMap.get(movement.branch_id);

      const quantity = Number(movement.quantity ?? 0);
      const unitCost = Number(movement.unit_cost ?? 0);

      return {
        ...movement,
        quantity,
        unitCost,
        totalValue: Math.abs(quantity) * unitCost,
        productCode: product?.sku ?? "—",
        productName: product?.name ?? "Unknown Product",
        branchName: branch?.name ?? "Unknown Branch",
      };
    })
    .filter((movement) => {
      if (!search) return true;

      return (
        movement.productCode.toLowerCase().includes(search) ||
        movement.productName.toLowerCase().includes(search) ||
        movement.branchName.toLowerCase().includes(search) ||
        movement.reference_number?.toLowerCase().includes(search) ||
        movement.movement_type.toLowerCase().includes(search)
      );
    });

  const stockInQuantity = movements
    .filter((movement) => movement.quantity > 0)
    .reduce((total, movement) => total + movement.quantity, 0);

  const stockOutQuantity = movements
    .filter((movement) => movement.quantity < 0)
    .reduce((total, movement) => total + Math.abs(movement.quantity), 0);

  const money = (value: number) =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 2,
    }).format(value);

  const movementLabel = (type: string) => {
    const labels: Record<string, string> = {
      purchase_receipt: "Purchase Receipt",
      sale: "Sale",
      sales_return: "Sales Return",
      purchase_return: "Purchase Return",
      adjustment_in: "Adjustment In",
      adjustment_out: "Adjustment Out",
      transfer_in: "Transfer In",
      transfer_out: "Transfer Out",
      opening_balance: "Opening Balance",
      goods_receipt: "Goods Receipt",
    };

    return (
      labels[type] ??
      type
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/inventory"
              className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              <ArrowLeft size={18} />
              Back to Inventory
            </Link>

            <h1 className="text-3xl font-bold">Stock Movement History</h1>

            <p className="mt-2 text-slate-500">
              Review all stock-in and stock-out transactions.
            </p>
          </div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-900">
                <History size={25} />
              </div>

              <div>
                <p className="text-sm text-slate-500">Total Movements</p>
                <p className="mt-1 text-2xl font-bold">{movements.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <ArrowDownToLine size={25} />
              </div>

              <div>
                <p className="text-sm text-slate-500">Stock In Quantity</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">
                  {stockInQuantity.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <ArrowUpFromLine size={25} />
              </div>

              <div>
                <p className="text-sm text-slate-500">Stock Out Quantity</p>
                <p className="mt-1 text-2xl font-bold text-red-600">
                  {stockOutQuantity.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-bold">Stock Transactions</h2>
            <p className="mt-1 text-sm text-slate-500">
              {movements.length} movement
              {movements.length === 1 ? "" : "s"} found
            </p>
          </div>

          <form className="grid gap-3 border-b border-slate-200 bg-slate-50 p-5 lg:grid-cols-[1fr_220px_170px_170px_auto_auto]">
            <div className="relative">
              <Search
                size={19}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                name="search"
                defaultValue={filters.search ?? ""}
                placeholder="Search product, branch or reference"
                className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <select
              name="type"
              defaultValue={movementType}
              className="h-14 rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500"
            >
              <option value="all">All movement types</option>
              <option value="purchase_receipt">Purchase Receipt</option>
              <option value="goods_receipt">Goods Receipt</option>
              <option value="sale">Sale</option>
              <option value="sales_return">Sales Return</option>
              <option value="purchase_return">Purchase Return</option>
              <option value="adjustment_in">Adjustment In</option>
              <option value="adjustment_out">Adjustment Out</option>
              <option value="transfer_in">Transfer In</option>
              <option value="transfer_out">Transfer Out</option>
              <option value="opening_balance">Opening Balance</option>
            </select>

            <input
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              title="Date from"
              className="h-14 rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500"
            />

            <input
              type="date"
              name="date_to"
              defaultValue={dateTo}
              title="Date to"
              className="h-14 rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              className="h-14 rounded-xl bg-blue-600 px-6 font-semibold text-white hover:bg-blue-700"
            >
              Apply
            </button>

            <Link
              href="/inventory/movements"
              className="flex h-14 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 font-semibold hover:bg-slate-50"
            >
              Clear
            </Link>
          </form>

          {error ? (
            <div className="p-10 text-center">
              <p className="font-semibold text-red-600">
                Stock movements could not be loaded
              </p>
              <p className="mt-2 text-sm text-slate-500">{error.message}</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center p-10 text-center">
              <History size={54} className="text-slate-300" />

              <h3 className="mt-4 text-lg font-bold">
                No stock movements found
              </h3>

              <p className="mt-2 text-slate-500">
                Stock movements will appear after receiving or issuing stock.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Branch</th>
                    <th className="px-6 py-4">Movement</th>
                    <th className="px-6 py-4 text-right">Quantity</th>
                    <th className="px-6 py-4 text-right">Unit Cost</th>
                    <th className="px-6 py-4 text-right">Value</th>
                    <th className="px-6 py-4">Reference</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {movements.map((movement) => {
                    const isStockIn = movement.quantity > 0;

                    return (
                      <tr key={movement.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          {new Intl.DateTimeFormat("en-LK", {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                          }).format(
                            new Date(`${movement.movement_date}T00:00:00`)
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <p className="font-semibold">
                            {movement.productName}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {movement.productCode}
                          </p>
                        </td>

                        <td className="px-6 py-4 text-slate-600">
                          {movement.branchName}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              isStockIn
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {movementLabel(movement.movement_type)}
                          </span>
                        </td>

                        <td
                          className={`px-6 py-4 text-right text-lg font-bold ${
                            isStockIn
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {isStockIn ? "+" : "-"}
                          {Math.abs(movement.quantity).toLocaleString()}
                        </td>

                        <td className="px-6 py-4 text-right">
                          {money(movement.unitCost)}
                        </td>

                        <td className="px-6 py-4 text-right font-semibold">
                          {money(movement.totalValue)}
                        </td>

                        <td className="px-6 py-4">
                          <p className="font-medium">
                            {movement.reference_number ?? "—"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {movement.reference_type
                              ? movementLabel(movement.reference_type)
                              : "No reference"}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
