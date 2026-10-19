# POACustomers — Pickup & Delivery Orders Setup

This update supports both pickup from a selected branch and delivery to the customer's location. **Branch Staff is responsible for customer service and sees/processes orders assigned to their branch. The GM does not have an operational Orders screen and cannot read or update order records through the order tables/RPC.**

## 1. Deploy the files

Upload the full contents of this `POACustomers` folder to the existing customer's GitHub Pages repository, keeping all directory paths. The client-specific logo/theme and database connection are configured separately from POAC's software-provider identity.

## 2. Run/update the database setup

In this customer's Supabase project, open **SQL Editor → New query** and run `POACustomers-pickup-orders-setup.sql`. It is safe to re-run on the previous pickup-only setup: it adds delivery fields and status, preserves current orders and customer/reward/menu/branch data, recreates order-table policies, and recreates checked RPC functions.

The script requires the menu/category/location schema to exist first. It makes menu prices, order subtotal and item line prices nullable to match the optional menu-price requirement. It does not create a Supabase project automatically. New order totals use EGP unless the deployment's database setting `app.currency` is explicitly set.

## 3. Branch assignment and who handles orders

- The GM maintains branch records and assigns each Staff account to the correct branch using the **Assign Staff to Branches** panel on GM → Branch Locations. This panel uses a protected database function; it does not give GM access to the operational order queue.
- Staff sees only orders where `pickup_orders.location_id` matches the Staff account's `profiles.location_id`.
- Customers can read only their own orders.
- GM/Admin accounts are not granted order reads; the GM does not process orders in this design.
- If Staff does not have an active assigned branch, the Orders page shows a clear setup message and does not load another branch's orders.

## 4. Customer checkout: pickup or delivery

- The customer adds active menu items from `customer/customer-menu.html` and opens Orders.
- The customer selects either **Pickup from the branch** or **Delivery to my location**, then selects the branch that handles preparation.
- For delivery, the customer must enter a full address and either share GPS coordinates via **Use my current location** (browser permission, on HTTPS) or paste a valid Google Maps link. The server-side RPC validates this before accepting the order.
- The customer can include an optional order note and then receives an order number to track status.
- The database reads item names and prices from Supabase. If any item has no published price, the subtotal stays NULL and Staff confirms the total.
- Pickup status flow: `placed` → `accepted` → `preparing` → `ready_for_pickup` → `completed`.
- Delivery status flow: `placed` → `accepted` → `preparing` → `out_for_delivery` → `completed`.
- Customer cancellation is allowed only while status is `placed`.

## 5. Test before launch

1. Ensure at least one active branch and active menu items exist.
2. Assign a test Staff user to that branch (`profiles.location_id`).
3. Sign in as a customer, create a pickup test order, and verify only the assigned Staff account sees it.
4. Place a second order as Delivery; try both GPS selection and a Google Maps link. Confirm that address/link appears on the Staff order card and opens Maps.
5. Verify Staff can move the order through the matching status flow and the customer sees updates on Refresh. Delivery requires both a written address and a usable map location; Staff must see and be able to open that location from the order card.
6. Sign in as GM and confirm there is no Orders shortcut or page, and direct REST/RPC order access is denied by RLS/role checks.

## Security notes

The SQL rebuilds policies on the order tables so old broad GM/Admin select policies cannot remain. It grants table SELECT access to authenticated users but uses RLS to limit rows to a customer’s own orders or Staff assigned to the matching branch. Status changes go through a SECURITY DEFINER RPC that verifies the account is active, has role `staff`, and is assigned to that order's branch. Never put a `service_role` key in browser code.
