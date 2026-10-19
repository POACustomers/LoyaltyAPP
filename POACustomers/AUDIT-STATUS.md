# POACustomers — White-label / Pre-Pilot Audit

- POAC Software Solutions is the platform owner; customer-facing brand, logo, theme and currency come from that tenant's `assets/tenant-config.js`.
- Every customer deployment must use its own Supabase project and its own `assets/config.js`. The multi-client kit build tool checks that a new tenant does not reuse a project URL already assigned to another tenant.
- The current Dina's Corner deployment uses the floral pink/cream tenant theme and EGP currency.
- Menu categories are loaded from `public.menu_categories`; no demo-category fallback is shown. Category/item images are picked from the device and uploaded to the configured tenant's Storage bucket.
- Menu item price is optional. Blank means NULL and the order total is shown as subject to Staff confirmation if any item lacks a price.
- Orders support Pickup and Delivery. Delivery requires a full address plus GPS coordinates or a valid Google Maps link.
- Only a customer can read their own orders. Only Staff with an active, assigned `profiles.location_id` can read and process orders for that branch. GM/Admin are excluded from operational order reads and status changes.
- GM still manages branches, menu, categories, offers and rewards; the Staff portal has the operational Orders queue.
- The files and JavaScript syntax were checked locally. Before pilot launch, the project owner must run the included SQL on the correct tenant database and test GPS delivery, branch routing, and RLS against live accounts.
