// Database connection for THIS customer deployment only.
// SUPABASE_PUBLISHABLE_KEY is a client-side publishable key, not a service_role/secret key.
// Tenant theme and currency live in tenant-config.js and are kept separate from this connection.
window.POA_CONFIG = Object.freeze({
  SUPABASE_URL: "https://nbwqoknkpkqgorxtyjnm.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ncPKXMFDGB6HI1lHs1kYmg_dB3hgaer"
});

window.POA_GET_CURRENCY_CODE = function () {
  const raw = String(window.POA_TENANT_CONFIG?.CURRENCY || "EGP").toUpperCase().trim();
  return /^[A-Z]{3}$/.test(raw) ? raw : "EGP";
};
window.POA_FORMAT_CURRENCY = function (value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  const currency = window.POA_GET_CURRENCY_CODE();
  const locale = String(window.POA_TENANT_CONFIG?.CURRENCY_LOCALE || (currency === "EGP" ? "en-EG" : "en"));
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return currency + " " + formatted;
};
