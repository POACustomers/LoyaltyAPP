POACustomers — Optional Address Details

IMPORTANT ORDER: Run the database migration before publishing the UI files.

1) Open the POACustomers Supabase project (not AL NOOR).
2) Run POACustomers/OPTIONAL-DELIVERY-ADDRESS-MIGRATION.sql in SQL Editor. It updates the saved-address columns, the pickup_orders delivery-address constraint, and place_customer_order so written delivery text is optional while a usable map point or Google Maps link is still required for Delivery. It does not delete existing records.
3) Upload/replace the files in this ZIP at the exact paths shown inside the ZIP.
4) Commit to main, wait for GitHub Pages to succeed, then hard-refresh the site (Ctrl+F5).

Address label defaults to Home. Written address details and delivery instructions are optional. Customers can skip address setup while registering. When saving an address, they can enter written details, select a map pin, or both. A delivery order still needs a usable map pin or Google Maps link so staff can locate the customer.
