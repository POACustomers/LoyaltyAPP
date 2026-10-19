// POACustomers configuration. Add credentials ONLY from your new Supabase project.
// Do not paste credentials from AL NOOR.
window.POA_CONFIG = Object.freeze({
  SUPABASE_URL: "https://nbwqoknkpkqgorxtyjnm.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ncPKXMFDGB6HI1lHs1kYmg_dB3hgaer",
  // Set this per company deployment: EGP for Egypt, AED for UAE, etc.
  CURRENCY: "EGP",
  CURRENCY_LOCALE: "en-EG"
});


// Shared currency formatter for menu prices and pickup orders.
window.POA_GET_CURRENCY_CODE = function () {
  const raw = String(window.POA_CONFIG?.CURRENCY || "EGP").toUpperCase().trim();
  return /^[A-Z]{3}$/.test(raw) ? raw : "EGP";
};
window.POA_FORMAT_CURRENCY = function (value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  const currency = window.POA_GET_CURRENCY_CODE();
  const locale = String(window.POA_CONFIG?.CURRENCY_LOCALE || (currency === "EGP" ? "en-EG" : "en"));
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return currency + " " + formatted;
};
