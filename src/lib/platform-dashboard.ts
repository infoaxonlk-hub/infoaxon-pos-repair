export type PlatformSummary={total_businesses:number;active_businesses:number;inactive_businesses:number;
 trial_subscriptions:number;active_subscriptions:number;blocked_subscriptions:number;
 expiring_7_days:number;expiring_30_days:number;monthly_recurring_fee:number;
 enabled_modules:number;active_branches:number;active_client_admins:number};
export type SubscriptionAttention={business_id:string;business_name:string;business_code:string;
 plan:string;status:string;ends_on:string|null;days_remaining:number|null;
 monthly_fee:number;currency_code:string};
