# POACustomers — GM Rewards Edit/Delete

The GM Rewards page now supports adding, editing and deleting rewards.

## One-time Supabase setup

1. Open the `POACustomers` Supabase project.
2. Go to **SQL Editor** and create a new query.
3. Copy the full contents of `POACustomers-rewards-edit-delete-setup.sql` into the query and click **Run**.
4. Deploy the updated project files to the existing `POACustomers` GitHub repository.
5. Open the GM Rewards page and use `Ctrl+F5` to refresh the browser cache.

The SQL enables GM/Admin insert, update and delete access for the rewards table. It does not delete or rewrite existing reward data. Deletion can still be blocked by a database foreign key if the reward is already linked to customer redemption history; in that case, mark the reward inactive to keep the historical record intact.
