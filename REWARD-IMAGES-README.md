# POACustomers reward image recovery

The Rewards pages now recover automatically from stale or invalid `image_url` values stored in Supabase. When a saved image URL fails, the page falls back to the matching local image bundled with this project:

- `assets/reward-hot-cold.jpg` — Free Hot or Cold Drink
- `assets/reward-breakfast.jpg` — Breakfast
- `assets/reward-breakfast-drink.jpg` — Breakfast + Drink

No SQL change is required for this fallback. Existing custom image URLs remain preferred when they work. If an old saved URL fails, the customer, staff redemption, and GM reward list use the bundled matching image instead. The service-worker cache was versioned and these images were added to the shell cache to help ensure the updated files become available.

## Deploy

Upload all project contents to the existing `POACustomers` GitHub repository while preserving paths. After GitHub Pages deploys, open the app and do a hard refresh (`Ctrl + F5`). If the browser still serves an old service worker, close the installed PWA/browser tab and reopen the website once online.
