# POACustomers — White-label Loyalty & Orders

POAC Software Solutions owns the software platform. Each customer-facing deployment uses that customer's brand, theme, currency and independent Supabase project. Dina's Corner is the current themed tenant; a second customer must be generated as a separate deployment with a different database configuration.

## Before a pilot
1. Confirm the customer-specific logo/theme in `assets/tenant-config.js` and ensure `assets/config.js` uses only that tenant's own Supabase project.
2. Apply `POACustomers-menu-categories-setup.sql` for the menu/categories/images, then `POACustomers-pickup-orders-setup.sql` for pickup+delivery orders and Staff-only order handling.
3. Assign each Staff account to the branch it serves using `profiles.location_id`.
4. Test customer pickup and delivery checkout, including an address and map pin/link. Confirm the order is visible only to the assigned Staff account, not to GM/Admin.
5. Test the client theme, menu images, optional prices, rewards, locations and PWA on desktop and mobile.

## Menu and currency
- Categories and items come only from Supabase; no sample categories or static menu fallback are added.
- Category/item images are chosen from the device and uploaded to the tenant's Storage bucket.
- Item `Price (EGP)` is optional. A blank price is stored as NULL; totals stay “to be confirmed” when an item has no price.
- Currency is deployment-specific (`assets/tenant-config.js`); numeric prices are not converted automatically when the currency changes.

## Ordering and permissions
- Orders support branch pickup or delivery. Delivery requires a full customer address plus GPS coordinates or a valid Google Maps link.
- Only Staff assigned to a branch can see and process orders for that branch. GM manages menu, offers, categories and branches, but does not see operational orders.
- See [`PICKUP-ORDERS-SETUP.md`](PICKUP-ORDERS-SETUP.md) for SQL and pilot tests.

## Multi-client package
See `../POAC-Multi-Client-Kit/README.md` for the tenant template and build tool. Never bundle a `service_role` or `sb_secret_` key in browser files.
