# POACustomers reward image replacement

The three standard rewards now have a consistent premium cream / navy / gold photo set:

- `assets/reward-hot-cold.jpg` — Free Hot or Cold Drink
- `assets/reward-breakfast.jpg` — Breakfast
- `assets/reward-breakfast-drink.jpg` — Breakfast + Drink

## Apply the changes

1. Upload the project contents to the existing `POACustomers` GitHub repository, preserving folder paths.
2. Wait for GitHub Pages to deploy.
3. In the matching POACustomers Supabase project, open SQL Editor and run `POACustomers-replace-reward-images.sql` once. It updates only the image URLs for the three named standard rewards; it does not remove or change points, coupons, reward costs, or statuses.
4. Refresh customer and staff reward pages with `Ctrl + F5`.

The SQL references the public GitHub Pages asset URLs under `/LoyaltyAPP/assets/`. If the repository's published base path changes, update those three URLs in the SQL before running it.
