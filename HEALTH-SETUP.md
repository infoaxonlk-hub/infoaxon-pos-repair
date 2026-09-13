# Platform health and reliability 027

1. Apply `supabase/migrations/027_platform_health_checks.sql` once in the Supabase SQL Editor.
2. Run `npx next typegen && npx tsc --noEmit`.
3. Refresh the Platform page and select `System health`.

The health page performs read-only checks for active client businesses. Critical issues cover subscription access, main branch and client administrator availability. Warnings cover modules, contact profile and branding. The new application error and not-found pages avoid exposing technical server error details to users.
