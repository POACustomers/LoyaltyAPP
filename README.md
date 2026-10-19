# POACustomers

Independent loyalty-system starter based on the uploaded project files.

- Project/repository name: `POACustomers`
- Project contact email: `pointofattractioncustomers@gmail.com`
- Supabase: must be a newly created project owned/managed for POACustomers.
- Configuration file: `assets/config.js` (URL and publishable key are intentionally blank).

## Before uploading/launching
1. Confirm this repository is under the new GitHub account.
2. Create a new Supabase project; do not reuse the AL NOOR project.
3. Add the new Supabase Project URL and Publishable Key to `assets/config.js`. Until configured, login/register and role pages intentionally show a setup warning and do not attempt to connect to a placeholder URL.
4. Review/create the database schema and Row Level Security policies for this project.
5. Test Customer, Staff, GM, and Admin portals before real customer use.

The email above is project contact information; it does not automatically change the owner email of GitHub or Supabase accounts.


## Menu categories and images repair (2026-10-17)
- Added standalone GM Categories page at `gm/gm-categories.html` and a Categories tile in GM Settings.
- Broken profile-image URLs now fall back to the user initials instead of showing broken-image alt text.
- Customer menu now uses category image URLs when present and falls back to category icons if images fail.
- Run `POACustomers-menu-categories-setup.sql` in the new POACustomers Supabase project if the menu tables do not exist.


## Final feedback batch applied (2026-10-17)
- Customer categories now come only from `public.menu_categories`; no demo category fallback or static menu catalog is shown.
- Category photos use a consistent image frame and local file uploads use the `poac-menu-images` Storage bucket.
- The GM item form includes an optional `Price (EGP)` field and local image picker; the official menu import UI is absent.
- GM can add, edit, activate/deactivate, and remove branch locations; customer locations are loaded from the database and open a real Google Maps URL/search.
- The GM dashboard no longer shows point/customer KPI cards or the old Performance Overview chart. The System Admin dashboard focuses on customer registrations per minute and no longer shows the old Administration action buttons.
- Run `POACustomers-menu-categories-setup.sql` once/re-run safely for menu image storage and location policies. If the old sample categories/items exist in the live database, run `POACustomers-clear-old-sample-menu-once.sql` once before adding your own categories. This cleanup affects only listed sample categories and their linked menu items.


## Optional menu-item prices (2026-10-19)
- Menu item price is optional across every category. Leave Price (EGP) blank to save `NULL`; a price is shown to customers only when a valid value is supplied.
- If the live Supabase schema already requires a price, run `POACustomers-price-optional-migration.sql` in SQL Editor.


## Customer Pickup Orders

See [`PICKUP-ORDERS-SETUP.md`](PICKUP-ORDERS-SETUP.md) and run [`POACustomers-pickup-orders-setup.sql`](POACustomers-pickup-orders-setup.sql) in the POACustomers Supabase project. Pickup ordering is branch-based; delivery and online payment are not included.


## Currency configuration (2026-10-19)
- Egypt deployments use `EGP` as the default currency. Menu prices and pickup-order totals share the currency formatter in `assets/config.js`.
- For another country, set `CURRENCY` and `CURRENCY_LOCALE` in that tenant's config and use the matching currency default in `POACustomers-pickup-orders-setup.sql`.
- Numeric amounts are not converted when changing the label; verify menu prices are entered in the chosen tenant currency.
