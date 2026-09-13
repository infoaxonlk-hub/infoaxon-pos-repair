# Platform dashboard 025

1. Apply `supabase/migrations/025_platform_dashboard.sql` once in the Supabase SQL Editor.
2. Run `npx next typegen && npx tsc --noEmit`.
3. Refresh the Platform page.

The dashboard uses read-only security-definer functions available only to authenticated platform administrators. Monthly recurring fee is informational and totals currently accessible trial and active subscriptions. Alerts include blocked, expired, future-start and subscriptions ending within 30 days.
