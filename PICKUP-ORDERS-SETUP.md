# POACustomers — Pickup Orders Setup

This update adds customer pickup ordering. Delivery and online payments are not included. Customers choose an active branch, add menu items to the basket, submit a pickup order, and track its status. GM can manage orders across branches; Staff can manage orders only for their assigned branch.

## 1. Deploy the files

Upload the full contents of this `POACustomers` folder to the existing GitHub Pages repository, keeping the directory paths. Do not upload only the changed files.

## 2. Run the database setup

In the POACustomers Supabase project, open **SQL Editor → New query** and run `POACustomers-pickup-orders-setup.sql` once. The existing menu/category/location setup must already be installed. The script creates `pickup_orders` and `pickup_order_items`, access policies, and protected RPC functions. It does not delete customer, points, rewards, menu, or branch data.

## 3. Ensure branches are active

The GM must add and activate real branch records before customers can order. Checkout requires one active pickup branch. Staff accounts need `profiles.location_id` set to their assigned branch to read and update that branch's orders. GM can see orders from all branches.

## 4. Order workflow

- Customer adds active menu items from `customer/customer-menu.html`; the basket is kept locally until the order is submitted.
- Customer chooses the pickup branch, adds an optional note, and submits the order.
- Database function validates item availability and quantities, reads prices from the database, snapshots order details, and creates an order number like `POA-XXXXXXXX`.
- If every item has a published price, the subtotal is calculated by the database. If any item has no price, subtotal remains NULL and the order UI says the branch must confirm the amount.
- Status flow: `placed` → `accepted` → `preparing` → `ready_for_pickup` → `completed`. A customer can cancel only while the order is still `placed`. Staff/GM can cancel an order before it is ready for pickup.

## 5. Test before using with customers

1. Sign in as a GM and open **Orders**.
2. Ensure at least one active branch and a few active menu items exist.
3. Sign in with a customer account, add an item from Menu, open Orders, select a pickup branch, and submit a test order.
4. Sign in as GM and progress the test order through the status steps. If testing staff access, assign that Staff profile a `location_id` matching its branch first.
5. Confirm the customer can see status updates after tapping Refresh.

## Security notes

Order creation, customer cancellation, and status transitions use SQL RPC functions with server-side checks. The browser cannot submit its own price: menu prices are read from Supabase. RLS limits customer reads to their own orders, GM/Admin can read all branch orders, and Staff can only read orders from their assigned branch. No Supabase `service_role` key is required or should be placed in browser code.
