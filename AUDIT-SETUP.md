# Platform audit log 024

1. Apply `supabase/migrations/024_platform_audit_log.sql` once in the Supabase SQL Editor.
2. Run `npx next typegen && npx tsc --noEmit`.
3. Restart the development server and open Platform → Audit log.

The audit table has no client-facing read, update or delete policy. New business, branding, module, subscription, branch and staff changes are recorded automatically. Existing client administrator events from migration 021 are retained in the unified log.
