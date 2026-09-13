# Production deployment and handover 028

## 1. Release gate

- Confirm migrations `001` through `027` were applied once and in order.
- Confirm migration `027` System Health shows no critical issues.
- Run `npm ci` and `npm run verify` from a clean checkout.
- Confirm the release commit is pushed to the approved GitHub branch.

## 2. Vercel deployment

1. Import `infoaxonlk-hub/infoaxon-pos-repair` into Vercel.
2. Select Next.js and keep the standard build command `npm run build`.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Production, Preview and Development.
4. Deploy the approved commit. Do not add a Supabase service-role key to this web application.
5. In Supabase Authentication URL Configuration, set Site URL to the production HTTPS domain and add the production reset-password redirect URL.

## 3. Production smoke check

- Open `/api/health` and confirm `status` is `ok`.
- Sign in as a platform administrator and review Dashboard, System Health and Audit Log.
- Sign in as a client administrator and confirm only that client's business data is visible.
- Confirm enabled modules open and disabled modules are blocked.
- Confirm logout and password reset return to the production domain.

## 4. Operations

- Apply every future migration once, in numeric order, before deploying code that depends on it.
- Review System Health and Audit Log before and after each release.
- Keep GitHub, Supabase and Vercel administrator access limited to authorized owners with MFA enabled.
- Use Supabase backups appropriate to the paid plan and export critical business data on the agreed schedule.
- Never send secrets in email, chat, screenshots or source control.

## 5. Rollback

1. Pause user changes when a release causes a critical problem.
2. Redeploy the last known-good Vercel deployment.
3. Do not reverse database migrations by deleting tables or data. Prepare and review a forward-fix migration.
4. Record the incident, affected clients, timeline, resolution and follow-up action.

## 6. Handover record

Record the production URL, release commit, deployment date, database project owner, Vercel owner, GitHub owner, support contact and backup responsibility in the private client handover record. Do not place passwords or secret keys in that record.
