# InfoAxon module selection — batch 020

Based on the supplied platform-admin-v1 source snapshot, commit 867e004.

## Corrected release — dollar-quote repair

The first release's generator collapsed PostgreSQL `$$` delimiters. This corrected installer preserves them byte-for-byte and recognizes the exact earlier installed files for safe repair. Replace the old installer with this version, run `--check`, then `--apply`. If the first SQL query failed, run `ROLLBACK;` separately in SQL Editor, then replace its entire query with the corrected 020 file and run it once. Do not globally replace dollar signs or bypass definition checks.

## Install

1. Save all editor files. Put `install-infoaxon-modules.cjs` next to package.json in the original infoaxon-pos-repair Codespace. Stay on platform-admin-v1.
2. Run `node install-infoaxon-modules.cjs --check`.
3. If the check succeeds, run `node install-infoaxon-modules.cjs --apply`.
4. In Supabase SQL Editor, create a query named `020_business_modules`. Paste the complete generated `supabase/migrations/020_business_modules.sql`, then run once. Do not rerun 019. Do not run fragments of 020.
5. If SQL reports an unexpected live function definition, stop and share that error. Do not remove its safety check or run the remaining statements. The transaction prevents partial installation; use ROLLBACK if the editor reports an aborted transaction before trying any later query.
6. Run the checks below, then start `npm run dev` if no development server is already running.
7. Platform → business Manage → Manage modules. Select modules and Save modules. Refresh the client's browser.

```bash
npx next typegen
npx tsc --noEmit
node scripts/module-checks.cjs
```

The installer backs up affected existing source files in a sibling folder before replacing them. It does not change Supabase, secrets, dependencies, Git commits or remotes. Unexpected existing source changes cause it to stop. Keep the backup until QA is complete.

## Behaviour

- Seven independently selectable modules: POS, Repairs, Inventory tools, Purchases, Expenses, Accounting, Reports.
- Existing and newly created businesses start with all seven enabled; configure a new business before handing it to a client.
- Products, Customers, Suppliers, payment methods, Settings and Dashboard remain shared core features. Inventory OFF means inventory tools are unavailable; an enabled POS, Repairs or Purchases module still processes stock normally.
- Disabled modules disappear from dashboard navigation and quick actions. Their routes, descendants, exports and matching API namespaces are blocked. Refresh updates already-open menus; stale pages cannot write through the guarded database RPCs.
- Disabling also stops unfinished operations, including session closing, repair payments, returns and cancellation. Finish open work first, or re-enable the module to finish it. No transaction is deleted.
- Historical SELECT access and existing tenant RLS remain unchanged. Dashboard, enabled Accounting and Reports retain historical figures. Module selection is a workflow entitlement, not a confidentiality boundary for historical data: direct read APIs retain the existing tenant access rules.
- Accounting can record settlement of old debts even when the original sales/purchases module is off. It cannot create or edit those original sales or repair jobs. This preserves receivables/payables handling.
- Only platform administrators can change module selections. Existing staff roles and business isolation remain in effect; enabling a module does not grant additional staff permissions.
- In-flight operations serialize with module changes: an operation already holding the business lock can finish before the disable finishes; subsequent operations are denied.
- SQL 020 checks the exact old definitions of all 22 replaced RPCs before committing. This protects live customizations not represented in the supplied source.

## Verification status and QA

Local verification passed: Next.js production build (`next build --webpack`), TypeScript, targeted ESLint, 49 isolated code/coverage checks and 6 installer safety checks, including repair of the old installed payload.

All migrations through 020 were also applied successfully in an isolated PGlite PostgreSQL engine with minimal auth/storage fixtures; all 22 guarded RPCs compiled. The corrected installer payload was byte-compared against the validated source. The bundled tests check TypeScript module logic, proxy behaviour, cookie preservation and SQL guard/delimiter coverage without contacting Supabase. Live Supabase and browser interaction QA remain required before production rollout.

Use a staging/test business. Do not deactivate the existing live demo business or alter its real financial transactions for testing.

| Check | Expected |
| --- | --- |
| All modules enabled | Existing workflows still work |
| Platform disables Repairs | Only that business loses Repairs menu and routes |
| Refresh another business | Its modules are unchanged |
| Existing repair page submits after disabling | RPC returns module-not-enabled; no write |
| Direct Supabase write to purchase orders/lines with Purchases off | Rejected |
| Direct expense-category write with Expenses off | Rejected |
| Direct transaction RPC for each disabled module | Rejected before any transaction/stock update |
| POS enabled, Inventory tools off | POS still consumes stock; adjustments/transfers cannot be submitted |
| Reports/Accounting remain enabled after disabling Repairs/POS | Historical totals and outstanding balances are unchanged |
| Accounting off, direct receipt/bill/payment RPC | Rejected |
| Business admin calls platform_set_business_modules | Rejected |
| Business admin attempts direct enabled_modules update | Rejected |
| Save two stale module forms | Second save asks for refresh |
| Re-enable module | Original data remains and operations resume |
| All modules off | Dashboard/shared core available; all seven workflows unavailable |
| Logged-out/inactive user | Existing access restrictions still apply |

## Save to the branch after checks

Review `git diff --stat` and `git status --short` first. Stage only this batch:

```bash
git add src/lib/modules.ts src/lib/modules-server.ts src/proxy.ts src/app/page.tsx src/app/module-unavailable/page.tsx 'src/app/platform/businesses/[id]/page.tsx' 'src/app/platform/businesses/[id]/modules' supabase/migrations/020_business_modules.sql scripts/module-checks.cjs MODULES-SETUP.md
git diff --cached --stat
git commit -m "Add per-business module selection and operation guards"
git push origin platform-admin-v1
```

Do not stage .env.local, source ZIPs, or installer scripts. A Git revert alone does not undo an applied SQL migration. To restore access normally, re-enable modules in the platform UI; do not delete data or drop tables.
