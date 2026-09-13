# Subscription and Licence Management — batch 022

Built against commit `72914fd` (`infoaxon-platform-021.zip`). This batch adds platform-controlled commercial terms and tenant access dates. It does not delete tenant data, process payments, issue invoices, or change enabled modules.

## Install

1. Save all editor files. Put `install-infoaxon-subscriptions.cjs` beside `package.json` in the original `platform-admin-v1` Codespace.
2. Run `node install-infoaxon-subscriptions.cjs --check` and only then `node install-infoaxon-subscriptions.cjs --apply`. The installer stops on unexpected files, creates a sibling backup, and never runs SQL, Git or network commands.
3. Open `supabase/migrations/022_subscription_licensing.sql`, copy the entire file to a new Supabase SQL Editor query named `022_subscription_licensing`, and run it once. Do not rerun older migrations.
4. Run `npx next typegen && npx tsc --noEmit`, then restart `npm run dev`.
5. Platform → business → **Subscription & licence**.

## Behaviour

- Existing businesses are grandfathered as active/custom with no end date, preventing accidental interruption during migration.
- New businesses receive a 30-day trial automatically.
- Access is permitted only for `trial` or `active` status, on/after the start date and on/before an optional end date.
- `past_due`, `suspended`, `cancelled`, a future start date, or an expired end date blocks tenant UI/API/database access. Platform administrators retain management access.
- Blocking access does not delete business, staff, transaction or report data. Restoring valid subscription terms restores access.
- Optimistic revision checks reject stale platform forms. Subscription tables and RPCs are unavailable to ordinary tenant accounts.
- Fees are informational commercial terms in LKR. No automatic payment collection, tax invoice or accounting posting is included.

## QA handoff

Use a disposable QA business and separate staff account. Do not suspend the live demo business during development.

- Existing businesses remain accessible immediately after migration.
- A newly created business starts with a 30-day trial.
- Platform admin can save each plan/status, fees, dates and notes; invalid dates/negative fees/stale forms fail safely.
- Expired, future, past-due, suspended and cancelled tenants reach the subscription-required page and direct API/database requests fail.
- Reactivation restores access without recreating data or staff.
- Ordinary admins cannot read or change subscription rows/RPCs; platform admins can.
- Business deactivation, module selection, branding, client-admin management and password recovery continue to work.

## Commit after SQL and checks

```bash
git add src/app/platform/page.tsx src/app/platform/businesses/[id]/page.tsx src/app/platform/businesses/[id]/subscription src/app/subscription-required src/lib/subscriptions.ts src/proxy.ts supabase/migrations/022_subscription_licensing.sql SUBSCRIPTIONS-SETUP.md
git diff --cached --stat
git commit -m "Add subscription and licence management"
git push origin platform-admin-v1
```

Do not commit installers, ZIP files, `.env.local`, or sibling backup folders. Git rollback does not reverse applied SQL.
