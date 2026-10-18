# POACustomers GM Dashboard — Customer Registration Analytics

The GM dashboard now focuses on registration analytics rather than management shortcut cards.

- **Today / This week / This month** counts are exact Supabase count queries against `public.profiles`, filtered to `role = 'customer'` and `created_at` within the current browser-local period. The week starts on Monday.
- **Registrations by hour** displays 24 completed hourly buckets. The current partial hour is excluded so the average is computed over 24 complete hours.
- **Average per hour** is `total registrations in the last 24 completed hours / 24`.
- Point transactions are not used to calculate customer registrations.
- Refresh runs the analytics queries again. The dashboard requires the current GM account to be able to read/count customer profiles under the existing Supabase RLS policies.
- The bottom GM navigation is simplified to Dashboard, Menu and Settings. The Settings page includes links to Customers and Branch Locations, so these pages remain accessible without occupying bottom-navigation slots.

No database migration is required for this dashboard-only change. It relies on `public.profiles.role` and `public.profiles.created_at` already used by the application.
