# Client Admin Management — batch 021

Built against your supplied infoaxon-admin-current.zip. Does not modify migrations 001–020, existing admin creation, business assignments, roles or secrets.

## Install

1. Save all editor files. Put install-infoaxon-client-admins.cjs next to package.json in the original Codespace, branch platform-admin-v1.
2. Run `node install-infoaxon-client-admins.cjs --check`, then `node install-infoaxon-client-admins.cjs --apply` if the check passes. Unexpected code causes a safe stop; do not delete files or force installation. Existing changed files are backed up in a sibling folder.
3. Open supabase/migrations/021_client_admin_management.sql. Copy the ENTIRE file into a NEW Supabase SQL Editor query and run once. Do not rerun 020. If 021 errors, stop and share the error.
4. Run `npx next typegen && npx tsc --noEmit` in Codespace. Start or refresh the development server.
5. Platform → Manage Client Admins → choose business → Show admins.

## Rules

- Platform administrators only. Platform membership accounts are excluded, including inactive platform memberships.
- Actions use target ID + business ID, not user-supplied email. No account is reassigned or deleted.
- The existing last-active-admin protection remains. Create/activate a second admin before disabling the last one. Disable an entire business from its Business settings if required; this screen does not bypass that rule.
- Deactivation blocks subsequent protected application/database requests. It is not deletion or immediate revocation of every Auth JWT. In-flight work may finish.
- Stale forms are rejected. Reload after another admin changes the account.
- Access changes and reset requests are recorded in a protected audit table. A reset-request record does not mean the email was delivered.
- Reset requests require an active client admin and active business, with a 60-second per-target cooldown. Supabase also applies its own limits.

## Required email setup (do not enable until configured)

Email delivery requires your configured SMTP service for real clients. Supabase's built-in sender restricts recipients to project team members. Do not add clients to your Supabase team to work around this.

Official references:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail

1. Configure your chosen SMTP service in Supabase Authentication email settings. Do not paste credentials into chat or Git.
2. In Authentication URL Configuration, set Site URL to the application's HTTPS origin. Add the exact `https://YOUR-APP/reset-password` URL to Redirect URLs. For Codespaces, use your forwarded port-3000 app origin, NOT the editor URL. The Codespace must be running and accessible to the recipient. Use a stable deployed URL for client delivery.
3. Back up the current Reset Password email template. Change ONLY the Reset Password template body to:

```html
<h2>Reset your InfoAxon password</h2>
<p>A password reset was requested for your account. If you did not request it, ignore this message.</p>
<p><a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}">Choose a new password</a></p>
<p>This link is single-use. Do not forward it.</p>
```

4. In the application's environment settings (local development: .env.local), set:

```dotenv
APP_ORIGIN=https://YOUR-APP
PASSWORD_RESET_EMAIL_READY=true
```

APP_ORIGIN must match Site URL exactly, with no trailing slash. Restart the dev server after environment changes. No new secret or dependency is needed. Leave PASSWORD_RESET_EMAIL_READY unset until all email setup is done; listing and activation still work.

Recovery verifies a single-use Supabase recovery token on POST, not on link preview/GET, then updates the password using an isolated public-key client. It never installs the client's session into the platform administrator's cookies. Password must be 12–128 characters and satisfy Supabase password policy. A rejected password update consumes the token: request a new email. The flow attempts global sign-out after success; already issued JWTs can remain valid until expiry. Never log tokens/passwords or forward recovery URLs. Disable email click tracking and redact query strings from external access logs.

## QA before production

Use a separate QA business, not the live demo business.

- Listing shows only the selected business's client admins; ordinary business admins cannot access this page or its RPCs.
- With two QA admins, deactivate one and verify their existing session loses protected access. Reactivate and log in again.
- Try disabling the last admin: blocked. Try a stale form: blocked.
- Reset email arrives at the stored account address. Open it in another browser/device, set a password, then log in with the new password. Old password fails.
- Reused/expired/invalid link fails; weak password gives a safe error; no plaintext passwords or tokens are shown in admin results.
- Rapid duplicate reset requests are throttled; SMTP errors are not reported as delivery success.
- Platform administrator stays logged in as the platform administrator. Password reset does not reactivate disabled accounts.
- Existing module selection, business branding, staff management and tenant isolation continue working.

Local TypeScript and PostgreSQL fixture checks are performed before delivery; live email delivery and browser QA require your environment and remain pending.

## Commit only after review

```bash
git add src/app/platform/page.tsx src/proxy.ts src/app/platform/admins/page.tsx src/app/platform/admins/actions.ts src/app/platform/admins/admin-controls.tsx src/app/reset-password supabase/migrations/021_client_admin_management.sql CLIENT-ADMINS-SETUP.md
git diff --cached --stat
git commit -m "Add client admin access management and password recovery"
git push origin platform-admin-v1
```

Do not stage installer files, ZIPs or .env.local. Git rollback does not reverse SQL; do not drop tables to undo this batch.
