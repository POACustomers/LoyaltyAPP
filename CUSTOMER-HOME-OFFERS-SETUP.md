# POACustomers — Customer Home Offers

The setup script creates `public.offers` if it does not exist, then enables Row Level Security and adds customer/manager policies. It is safe to run repeatedly and does not modify customers, points, rewards, menu items, or categories.

## Apply
1. Open Supabase SQL Editor for the POACustomers project.
2. Run `POACustomers-customer-home-offers-setup.sql`.
3. Publish the project files to GitHub preserving folder paths.
4. Test as GM by creating an offer with production date on/before today and expiry date today or later. Then test the customer home page.

Images are currently saved by the app as compressed data URLs in `image_url`. For a larger production rollout, Supabase Storage is recommended.
