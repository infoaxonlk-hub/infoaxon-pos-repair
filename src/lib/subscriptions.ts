export const SUBSCRIPTION_PLANS = ["trial", "basic", "standard", "premium", "custom"] as const;
export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;
export type Subscription = {
  business_id:string; business_name:string; plan:typeof SUBSCRIPTION_PLANS[number];
  status:typeof SUBSCRIPTION_STATUSES[number]; starts_on:string; ends_on:string|null;
  monthly_fee:number; additional_module_fee:number; currency_code:string;
  notes:string|null; revision:number; updated_at:string;
};
