# Role access and account switching

All users sign in from `/login`. The page presents separate choices for InfoAxon Admin, Business Owner/Admin and Business Staff. The authenticated account still determines the permitted role and workspace.

- Platform administrators open `/platform`.
- Client administrators and managers open the business dashboard at `/`.
- Cashiers are limited to `/pos`.
- Technicians entering `/` are sent to `/repairs`.

From the platform business list, choose **Open client**, then **Login to client system** beside the intended active client administrator. A verified server action securely signs out the platform session and opens the Business Owner/Admin login with that administrator email filled in. The password is never stored, displayed or transferred.

The business dashboard header displays the current user, role and branch. **Switch account** signs out and returns to the login page.

## Verification

1. Run `npm run verify`.
2. Sign in as a platform administrator and choose **Open client** for a business.
3. Choose **Login to client system** and confirm the login form shows the business, role and correct email.
4. Enter that user's password and confirm the business dashboard shows the user, role and branch.
5. Confirm a cashier is sent to POS Billing and cannot open other protected areas.
6. Confirm a technician entering the root dashboard is sent to Repair Jobs.
