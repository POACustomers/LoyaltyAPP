/* Public read-only database client for the standalone NFC menu.
   It intentionally does not persist or reuse customer login sessions. */
(function () {
  'use strict';
  if (window.POA_PUBLIC_MENU_DB) return;

  const config = window.POA_CONFIG || {};
  const url = String(config.SUPABASE_URL || '').trim();
  const key = String(config.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const validUrl = /^https:\/\/[^/]+\.supabase\.co\/?$/i.test(url);
  const validKey = !!key && !/YOUR[_-]|PLACEHOLDER|REPLACE_ME|POA_CONFIG_NOT_SET/i.test(key + url);

  if (!window.supabase || !validUrl || !validKey) {
    console.error('Public menu database client could not be initialized: check assets/config.js.');
    return;
  }

  try {
    window.POA_PUBLIC_MENU_DB = window.supabase.createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: { headers: { 'x-client-info': 'poac-public-menu' } }
    });
  } catch (error) {
    console.error('Public menu database client initialization failed:', error);
  }
})();
