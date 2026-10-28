POAC / Dina's Corner — Home Page Final Changes

Files in this ZIP are patch files. Upload them into the POACustomers repository using the same paths.

Includes:
- customer/customer-home.html: replaces the top Great rewards banner with GM-managed Best Sellers photos, adds the signed-in customer's profile photo to the existing green loyalty card, keeps the points/progress/card link, and uses an explicit fixed bottom navigation.
- assets/customer-home.css: scoped mobile styling for the updated home page only.
- assets/customer-home-categories.js: category image strip only; no category title, category labels, frame, arrows, counter or instructions. Uses existing menu_categories image_url values so the current photos are not replaced.
- assets/customer-home-featured.js: loads the GM-managed Best Sellers photos and the signed-in customer's avatar.
- GM/gm-home-products.html: GM page to upload multiple product photos, remove photos, and reorder them.
- GM/gm-dashboard.html: adds a link to the Best Sellers photo manager.
- sw.js: bumps the cache version and includes the new page/assets.
- SUPABASE-HOME-BEST-SELLERS-SETUP.sql: required one-time table/storage setup.

Required setup before uploading Best Sellers photos:
1. Open Supabase SQL Editor for the Dina's Corner / POACustomers project.
2. Paste the entire contents of SUPABASE-HOME-BEST-SELLERS-SETUP.sql and run it once.
3. Upload the ZIP files keeping their relative paths. Do not upload a nested folder named `customer` into another `customer` folder; files should land exactly at customer/customer-home.html, assets/..., GM/..., and sw.js.
4. Sign into the GM account, open Dashboard, then Manage Photos. Upload the product images and arrange them with the arrows. They appear as an image-only swipe strip at the top of the customer home page.

Payment details in this patch:
- InstaPay number: 01282471226 (with phone icon).
- Vodafone Cash number: 01002348055 (with the Vodafone red mark, not a generic cash symbol).
- Instagram and Facebook are icon-only links to the URLs provided in chat.
- No payment-section frame or payment headings; the two payment methods appear side by side.

The page uses the existing Supabase `profiles.avatar_url` value for the customer photo. If no image is selected in Profile, the small avatar position stays hidden.
