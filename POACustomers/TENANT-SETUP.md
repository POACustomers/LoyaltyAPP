# Tenant identity vs POAC

**POAC Software Solutions is the platform owner. It is not the customer-facing app brand.** Every company deployment has a separate `assets/tenant-config.js` for the brand name, logo, app name, tagline, colors, theme, decorative frame, currency and PWA identity. `assets/config.js` holds only that deployment's Supabase URL and publishable key.

Dina's Corner is the current tenant and uses the supplied floral pink/cream theme. A second company must get a separate generated deployment, its own logo/icon/theme files, and its own Supabase project. Never select another customer's project through a query-string or local storage value, and never reuse Dina's Supabase URL/key for another company.

See `POAC-Multi-Client-Kit/README.md` in the complete package and `tools/build_tenant.py` for the repeatable build process. The kit does not create Supabase projects automatically; a project must be created first, then its public URL/publishable key entered into that tenant's configuration. Apply the database setup and verify RLS before allowing customers in.
