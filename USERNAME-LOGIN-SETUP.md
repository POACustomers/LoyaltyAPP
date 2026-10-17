# POACustomers — Username-only customer registration

Customer registration now shows only:
- Username (required; 3–24 chars: a-z, 0-9, dot, underscore, hyphen)
- Mobile number (optional)
- Date of birth (optional)
- Password (required; minimum 6 chars)

Customer sign-in uses username + password. The existing Admin, GM and Staff sign-in pages are unchanged and still use the current email-based management accounts.

## Required Supabase setup

1. Open the SQL Editor in the **POACustomers Supabase project**.
2. Run `supabase_username_setup.sql`.
3. In Supabase Dashboard, open **Authentication → Sign In / Providers → Email** and turn **Confirm email OFF**. Username-only customers do not have an email inbox for confirmation.
4. Deploy the updated files to GitHub Pages and hard-refresh the site.
5. Register a test customer with a unique username.

## Important technical note

Supabase Auth internally requires an email identifier for email/password authentication. This implementation generates an internal synthetic address from the username (`username@poacustomers.invalid`) so customers never need to enter or see an email. Do not enable email confirmation for this flow. Do not use the synthetic address for email delivery or password recovery. A future password recovery flow should use a verified phone-based process or a trusted admin reset.

The migration adds a `username` column and a unique index for customer usernames. It does not delete customer records, points, rewards, or transactions. Existing customer accounts created with real email addresses are not automatically converted; plan a migration for them before relying on username login for those accounts.
