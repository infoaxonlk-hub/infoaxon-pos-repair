export const MODULES = [
  { id: "pos", name: "POS Billing", description: "Sales, sessions, receipts and returns." },
  { id: "repairs", name: "Repairs", description: "Repair jobs, parts, status changes and payments." },
  { id: "inventory", name: "Inventory", description: "Stock tools, adjustments, transfers and exports." },
  { id: "purchases", name: "Purchases", description: "Purchase orders and goods receipts." },
  { id: "expenses", name: "Expenses", description: "Expense categories, approval and payments." },
  { id: "accounting", name: "Accounting", description: "Customer receipts, supplier bills and payments." },
  { id: "reports", name: "Reports", description: "Consolidated reporting, including historical transactions." },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];
export const MODULE_IDS: readonly ModuleId[] = MODULES.map((module) => module.id);
export function isModuleList(value: unknown): value is ModuleId[] {
  return Array.isArray(value) && value.length <= MODULE_IDS.length &&
    new Set(value).size === value.length &&
    value.every((id) => MODULE_IDS.includes(id as ModuleId));
}
export function routeModule(pathname: string): ModuleId | null {
  // Exact first segment: /pos-other is not /pos. API namespaces share the rule.
  const parts = pathname.split("/").filter(Boolean);
  const area = parts[0] === "api" ? parts[1] : parts[0];
  return MODULE_IDS.includes(area as ModuleId) ? area as ModuleId : null;
}
