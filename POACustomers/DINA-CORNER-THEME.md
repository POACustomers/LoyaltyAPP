# Dina's Corner Visual Theme

This deployment uses the visual language from the supplied Dina's Corner menu artwork across customer, staff, GM, admin, and standalone menu pages. It is a client-specific white-label theme and does not redefine the POAC Software Solutions corporate brand for future clients.

- Palette: cream/blush backgrounds, rose-pink primary buttons, olive-green headings and accents, muted gold dividers.
- Outer frame: thin double blush/gold border plus floral corner artwork extracted from the user-provided menu reference.
- Branding: Dina's Corner logo in top bars, login/registration pages, and PWA icon.
- Menu/customer ordering, staff, GM, and admin functionality and database structure are left unchanged.
- Currency remains EGP as configured in `assets/config.js`.

To adjust or remove the theme later, edit `assets/dina-theme.css`; all HTML pages link this stylesheet after their previous CSS.

## Official logo and customer landing page refresh (2026-11-13)

- The approved floral Dina's Corner logo supplied by the owner is stored separately as `assets/dina-corner-official-logo.jpg`; existing GM/customer icon assets remain untouched to avoid changing unrelated application screens.
- The new mobile-first customer entry page is `welcome.html`. It offers View Our Menu and Evaluate Us.
- View Our Menu opens the existing standalone menu and preserves an optional `location_id` for branch-specific NFC URLs.
- Evaluate Us loads active branches from the existing `locations` table and opens each branch's saved `maps_url`; when no maps URL is saved, it falls back to a Google Maps search for that branch's name/address/city.
- The standalone menu now uses the approved burgundy/coral/cream palette and the official logo. Category placeholders use lightweight SVG line icons based on category names; uploaded category images remain unchanged.
- No database schema, order flow, cart, staff, GM, admin, or Supabase credentials were changed.

Public landing URL after deployment:
`https://poacustomers.github.io/LoyaltyAPP/POACustomers/welcome.html`

Branch-specific landing URL format (optional):
`https://poacustomers.github.io/LoyaltyAPP/POACustomers/welcome.html?location_id=<branch-id>`
