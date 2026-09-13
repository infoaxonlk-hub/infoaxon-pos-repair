# InfoAxon POS & Repair

Multi-tenant POS and repair management system built with Next.js and Supabase.

## Local development

1. Copy `.env.example` to `.env.local` and add the Supabase project values.
2. Install dependencies with `npm ci`.
3. Start the application with `npm run dev`.

## Verification

Run `npm run verify` before a production release. This performs route type generation, TypeScript checks and a production build.

## Production

The application is designed for Vercel. Set both variables from `.env.example` in Vercel for Production, Preview and Development. Never commit `.env.local` or privileged Supabase keys.

The public `GET /api/health` endpoint reports only application readiness and does not expose configuration values or database data.

See `PRODUCTION-HANDOVER.md` for deployment, rollback and handover steps.
