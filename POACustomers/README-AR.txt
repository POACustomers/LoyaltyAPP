POAC / Dina's Corner — GM cancellation invoice download

Upload and replace these files at the same repository paths:
- GM/gm-cancellations.html
- assets/pickup-orders.js
- sw.js

The cancellation log will show a DOWNLOAD INVOICE button per record. It loads the order and item details from Supabase and downloads the existing Dina's Corner order receipt as PNG, including cancellation state/reason when available. This is the existing order receipt format, not a tax invoice.

No SQL migration is included. The signed-in GM must already have SELECT permissions for the order and order-item records, as set up in the prior GM all-branch-orders fix.
