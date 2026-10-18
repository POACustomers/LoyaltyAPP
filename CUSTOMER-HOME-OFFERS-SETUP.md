# POACustomers — Customer Home Offers

The customer home promo panel now displays up to three currently active offers from `public.offers`, including the photo uploaded by the GM, name, description, and expiry date. If there are no current offers (or the read policy has not yet been applied), the existing “More Rewards / Brighter Days” fallback remains visible.

## Apply the update

1. In the POACustomers Supabase project, open SQL Editor.
2. Run `POACustomers-customer-home-offers-setup.sql`.
3. Publish the project files, preserving folder structure.
4. Sign in as a customer and refresh with Ctrl+F5. Create an active offer as GM with a product image, production date on/before today, and expiry date today or later.

The SQL is non-destructive. It enables RLS on `offers`, allows active customer profiles to read only current active offers, and allows active GM/Admin profiles to manage offers. If your live `offers` table has custom restrictive policies or a different schema, review them before running the SQL.
