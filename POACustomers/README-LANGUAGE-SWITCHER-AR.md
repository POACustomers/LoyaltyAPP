POACustomers — Arabic / English Language Switcher

This patch updates only two files in the existing GitHub Pages repository:
1) POACustomers/assets/tenant-branding.js — adds a polished top-right language switcher, persistent language preference, Arabic RTL, English LTR, and UI text translations for common Customer, Staff, GM, Admin, menu, profile and order screens. Arabic is the default the first time; the user can switch to English.
2) POACustomers/sw.js — bumps the service-worker cache name so installed PWAs can refresh the updated UI assets.

INSTALL:
- Extract this ZIP.
- In GitHub repository POACustomers/LoyaltyAPP, replace the existing files at these exact paths with the included files. Keep every other file unchanged.
- Commit to main and wait for GitHub Actions / Pages deployment to succeed.
- Open the site in a normal browser tab and hard-refresh (Ctrl+F5 on Windows). If an installed PWA still shows the old version, close it, open the site in Chrome, and reload after deployment finishes.

No SQL, Supabase configuration, address, order, points or rewards data is changed by this patch. User language preference is stored in localStorage as `poa_language`. A number of common UI texts are translated; unknown technical errors, client-entered names, branch names and product names may stay in their original language.
