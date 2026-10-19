# POACustomers — Independent Starter Audit

- Project name: POACustomers
- Project contact email: pointofattractioncustomers@gmail.com
- This copy is separate from AL NOOR and must use a new GitHub repository and a new Supabase project.
- Supabase URL and publishable key are intentionally blank in `assets/config.js`.
- Do not paste or reuse the previous AL NOOR Supabase URL or key.
- Before live use, configure the new Supabase project, create/verify the required schema and RLS policies, and test each portal.
- The UI and existing loyalty workflow are retained as a starting point; company-specific branches/menu content and database schema should be reviewed before production.


## Feedback batch: final implementation
- No hard-coded customer-menu categories or static menu catalog fallback.
- Consistent category image dimensions; category/item images are picked from the device and uploaded to Supabase Storage.
- Price (EGP) retained in GM item create/edit and displayed on menu items.
- Real branch locations managed by GM and displayed dynamically to customers; placeholder Branch 1–4 cards removed.
- GM Dashboard point/KPI cards and Performance Overview chart removed; Admin Dashboard action card removed while minute-by-minute customer registration chart is retained.
- Live Supabase operations must still be verified by the project owner after running the included SQL.
