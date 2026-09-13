# Branch management 023

1. Apply `supabase/migrations/023_branch_management.sql` once in the Supabase SQL Editor.
2. Run `npx next typegen && npx tsc --noEmit`.
3. Restart the development server.
4. Open Platform → Business → Manage branches.

The migration selects one existing branch per business as its protected main branch. A branch cannot be deactivated while it is the main branch, has active assigned staff, an open POS session, an unfinished repair, or an open purchase order. No branch or transaction data is deleted.
