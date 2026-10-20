
const POA_RUNTIME_CONFIG = window.POA_CONFIG || {};
const configuredSupabaseUrl = String(POA_RUNTIME_CONFIG.SUPABASE_URL || "").trim();
const configuredSupabaseKey = String(POA_RUNTIME_CONFIG.SUPABASE_PUBLISHABLE_KEY || "").trim();
const SUPABASE_CONFIGURED = /^https:\/\/[^/]+\.supabase\.co\/?$/i.test(configuredSupabaseUrl) && !!configuredSupabaseKey && !/YOUR[_-]|PLACEHOLDER|REPLACE_ME|POA_CONFIG_NOT_SET/i.test(configuredSupabaseKey + configuredSupabaseUrl);
// Never fall back to a real tenant database. A template with missing credentials points only
// to a reserved invalid hostname, and auth/register functions refuse to proceed until configured.
const SUPABASE_URL = SUPABASE_CONFIGURED ? configuredSupabaseUrl : "https://not-configured.invalid";
const SUPABASE_KEY = SUPABASE_CONFIGURED ? configuredSupabaseKey : "POA_CONFIG_NOT_SET";
window.POA_SUPABASE_CONFIGURED = SUPABASE_CONFIGURED;

if (!SUPABASE_CONFIGURED) {
  console.warn("This customer deployment has no Supabase project configured. Add its own URL and publishable key in assets/config.js; the app will not connect to another tenant's database.");
}
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.sb = sb;

const KEYS = {
  staffCustomer: "poa_staff_customer",
  customerToken: "poa_public_token"
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function initials(name) {
  return (name || "AN").trim().split(/\s+/).slice(0,2)
    .map(x => x[0]).join("").toUpperCase() || "AN";
}

function moneyPoints(n) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n || 0).toLocaleString();
}

async function getOwnAvatarUrl() {
  try {
    const { data: userData } = await sb.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;
    const { data, error } = await sb.from("profiles").select("avatar_url").eq("id", uid).maybeSingle();
    if (error) return null;
    return data?.avatar_url || localStorage.getItem("poa_avatar_url") || null;
  } catch { return null; }
}

function renderAvatar(el, name, url) {
  if (!el) return;
  const fallback = () => {
    el.classList.remove("avatar-photo");
    el.textContent = initials(name);
  };
  if (url && typeof url === "string" && /^(https?:|data:image\/)/i.test(url.trim())) {
    const img = document.createElement("img");
    img.alt = "Profile avatar";
    img.loading = "eager";
    img.referrerPolicy = "no-referrer";
    img.onerror = fallback;
    img.src = url.trim();
    el.replaceChildren(img);
    el.classList.add("avatar-photo");
  } else {
    fallback();
  }
}

async function saveCustomerAvatarChoice(url) {
  const { data: userData } = await sb.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) throw new Error("Please sign in again.");
  const { error } = await sb.from("profiles").update({avatar_url:url}).eq("id",uid);
  if (error) throw error;
  localStorage.setItem("poa_avatar_url", url);
  return url;
}

function bindAvatarChoices(currentUrl, profileName) {
  const buttons = document.querySelectorAll(".avatar-option");
  buttons.forEach(btn => {
    const url = btn.dataset.avatarUrl || "";
    if (url === currentUrl) btn.classList.add("selected");
    btn.onclick = async () => {
      buttons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      btn.disabled = true;
      try {
        const saved = await saveCustomerAvatarChoice(url);
        renderAvatar($("avatar"), profileName, saved);
        toast("Avatar updated successfully.");
      } catch (e) {
        btn.classList.remove("selected");
        toast(e?.message || "Could not update avatar.", false);
      } finally {
        btn.disabled = false;
      }
    };
  });
}

function bindCustomerNav(page) {
  const map = {
    "customer-home":"home", "customer-card":"card", "customer-rewards":"rewards", "customer-menu":"menu", "customer-locations":"locations", "customer-orders":"orders", "customer-profile":"profile"
  };
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === map[page]));
}

async function saveCustomerPhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be 5 MB or smaller.");
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=()=>reject(new Error("Could not read the photo.")); fr.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => { const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error("Invalid image.")); i.src=dataUrl; });
  const max=512, scale=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale));
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  const compressed=c.toDataURL("image/jpeg",0.78);
  const { data:userData } = await sb.auth.getUser();
  const uid=userData?.user?.id; if(!uid) throw new Error("Please sign in again.");
  const { error } = await sb.from("profiles").update({avatar_url:compressed}).eq("id",uid);
  if(error) throw error;
  localStorage.setItem("poa_avatar_url", compressed);
  return compressed;
}

function toast(message, good = true) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.cssText =
      "position:fixed;left:50%;bottom:" + (document.body?.dataset.page === "customer-menu" ? "82px" : (String(document.body?.dataset.page || "").startsWith("customer-") ? "24px" : "92px")) + ";transform:translateX(-50%);" +
      "z-index:99;max-width:90%;padding:12px 16px;border-radius:12px;" +
      "font-size:12px;font-weight:800;box-shadow:0 12px 30px #0002;" +
      "text-align:center;";
    document.body.appendChild(el);
  }
  el.style.background = good ? "#0b4a36" : "#b94a48";
  el.style.color = "#fff";
  el.textContent = message;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.remove(), 3000);
}

async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function getProfile() {
  const { data, error } = await sb.rpc("get_my_profile");
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function getStaffProfile() {
  const { data, error } = await sb.rpc("get_my_staff_profile");
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function guardRole(allowedRoles) {
  const session = await getSession();
  if (!session) {
    const role = allowedRoles[0];
    location.href = role === "customer" ? "customer-login.html" : role === "gm" ? "gm-login.html" : role === "admin" ? "admin-login.html" : "staff-login.html";
    return null;
  }

  const profile = await getProfile();
  const adminPortalAccess = profile?.role === "admin" &&
    allowedRoles.some(r => r === "gm" || r === "staff");
  if (!profile || (!allowedRoles.includes(profile.role) && !adminPortalAccess)) {
    toast("You do not have access to this portal.", false);
    await sb.auth.signOut();
    location.href = "../index.html";
    return null;
  }
  return profile;
}

function routeForRole(role) {
  if (role === "admin") return "admin-dashboard.html";
  if (role === "gm") return "gm-dashboard.html";
  if (role === "staff") return "staff-scan.html";
  return "customer-home.html";
}

function customerAuthEmail(username) {
  // Supabase Auth still uses an internal email identifier; customers never enter or see it.
  return `${String(username || "").trim().toLowerCase()}@poacustomers.invalid`;
}

async function login(role) {
  if (!SUPABASE_CONFIGURED) {
    const cfgMsg = $("msg");
    if (cfgMsg) cfgMsg.textContent = "This company portal is not connected to its own database yet. Contact the system administrator.";
    return;
  }
  const username = role === "customer" ? $("username")?.value.trim().toLowerCase() : "";
  const email = role === "customer" ? customerAuthEmail(username) : $("email")?.value.trim().toLowerCase();
  const password = $("password")?.value;
  const msg = $("msg");

  if (!(role === "customer" ? username : email) || !password) {
    if (msg) msg.textContent = role === "customer" ? "Enter your username and password." : "Enter your email and password.";
    return;
  }
  if (role === "customer" && !/^[a-z0-9._-]{3,24}$/.test(username)) {
    if (msg) msg.textContent = "Use 3–24 characters: English letters, numbers, dot, underscore or hyphen.";
    return;
  }

  if (msg) msg.textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (msg) msg.textContent = role === "customer" ? "Username or password is incorrect." : error.message;
    else toast(error.message, false);
    return;
  }

  try {
    const profile = await getProfile();
    if (!profile) throw new Error("Your profile is not ready yet. Please try again.");
    if (profile.role !== role) {
      await sb.auth.signOut();
      throw new Error(`This account is not registered as ${role}.`);
    }
    location.href = routeForRole(profile.role);
  } catch (e) {
    if (msg) msg.textContent = e.message || "Login failed.";
  }
}

async function registerCustomer() {
  if (!SUPABASE_CONFIGURED) {
    const cfgMsg = $("msg");
    if (cfgMsg) cfgMsg.textContent = "This company portal is not connected to its own database yet. Contact the system administrator.";
    return;
  }
  const username = $("username")?.value.trim().toLowerCase();
  const phone = $("phone")?.value.trim() || null;
  const password = $("password")?.value;
  const birthday = $("birthday")?.value || null;
  const msg = $("msg");

  if (!username || !password) {
    msg.textContent = "Username and password are required.";
    return;
  }
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    msg.textContent = "Username must be 3–24 characters and use English letters, numbers, dot, underscore or hyphen only.";
    return;
  }
  if (password.length < 6) {
    msg.textContent = "Password must be at least 6 characters.";
    return;
  }

  const addressResult = window.POACustomerAddresses?.registrationPayload?.();
  if (!addressResult || !addressResult.ok) {
    if (msg) msg.textContent = addressResult?.message || "Select your delivery address and map location before creating your account.";
    return;
  }
  const savedAddress = addressResult.address;

  msg.textContent = "Creating your Dina's Corner account…";
  const { data, error } = await sb.auth.signUp({
    email: customerAuthEmail(username),
    password,
    options: {
      data: {
        username,
        full_name: username,
        phone,
        birthday,
        birthday_contact: false
      }
    }
  });

  if (error) {
    const message = String(error.message || "");
    msg.textContent = /already registered|already exists|unique/i.test(message)
      ? "That username is already taken. Please choose another."
      : message;
    return;
  }

  if (!data.session) {
    msg.textContent = "Supabase email confirmation is enabled. To use username-only accounts, turn OFF Confirm email in Supabase Authentication settings, then register again.";
    return;
  }

  const customerId = data.user?.id || data.session?.user?.id;
  if (!customerId) {
    msg.textContent = "Your account was created, but Supabase did not return the customer ID. Sign in and save your delivery address from My Profile.";
    return;
  }

  if (savedAddress) {
    msg.textContent = "Account created. Saving your delivery address…";
    const { error: addressError } = await sb.from("customer_addresses").insert({
      customer_id: customerId,
      ...savedAddress,
      is_default: true
    });
    if (addressError) {
      console.error("Customer account was created but the initial address could not be saved:", addressError);
      msg.textContent = "Your account was created, but the address could not be saved. You can sign in and add it from My Profile. Details: " + addressError.message;
      setTimeout(() => location.href = "customer-profile.html", 2500);
      return;
    }
    msg.textContent = "Account and delivery address created. Opening your loyalty account…";
  } else {
    msg.textContent = "Account created. You can add a delivery address now or later from My Profile.";
  }
  setTimeout(() => location.href = "customer-home.html", 700);
}

async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem(KEYS.customerToken);
  localStorage.removeItem(KEYS.staffCustomer);
  location.href = "../index.html";
}

function escapeOfferHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[ch]));
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeOfferImageSource(value) {
  const source = String(value || "").trim();
  if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(source)) return source;
  if (/^https?:\/\//i.test(source)) return source;
  return "";
}

async function loadCustomerHomeOffers() {
  const content = $("homeOffersContent");
  if (!content) return;

  const today = getLocalDateString();
  try {
    const { data, error } = await sb
      .from("offers")
      .select("id,title,product_name,description,production_date,expiry_date,image_url,status,created_at")
      .eq("status", "active")
      .lte("production_date", today)
      .gte("expiry_date", today)
      .order("created_at", { ascending: false })
      .limit(3);

    // If offers are not configured yet, preserve the approved fallback message.
    if (error) throw error;
    const offers = Array.isArray(data) ? data : [];
    if (!offers.length) return;

    const cards = offers.map(offer => {
      const title = offer.product_name || offer.title || "Special Offer";
      const description = offer.description || "A special offer is available for customers.";
      const image = safeOfferImageSource(offer.image_url);
      const expiry = offer.expiry_date
        ? `<span class="home-offer-expiry">Valid through ${escapeOfferHtml(offer.expiry_date)}</span>`
        : "";
      return `
        <article class="home-offer-item">
          ${image
            ? `<div class="home-offer-image-wrap"><img class="home-offer-image" src="${escapeOfferHtml(image)}" alt="${escapeOfferHtml(title)}" loading="lazy"></div>`
            : `<div class="home-offer-no-image" role="img" aria-label="Offer image unavailable"><span>★</span><small>Special Offer</small></div>`}
          <div class="home-offer-body">
            <strong class="home-offer-title">${escapeOfferHtml(title)}</strong>
            <p class="home-offer-description">${escapeOfferHtml(description)}</p>
            ${expiry}
          </div>
        </article>`;
    }).join("");

    content.className = "home-offers-content";
    content.innerHTML = `
      <div class="home-offers-head"><div><h3>Special Offers</h3><p class="sub">Current offers from Dina's Corner.</p></div></div>
      <div class="home-offers-list">${cards}</div>`;
  } catch (error) {
    // Keep the page usable if offer read policies have not been applied yet.
    console.warn("Could not load customer home offers:", error?.message || error);
  }
}

async function loadCustomerHome() {
  const profile = await guardRole(["customer"]);
  if (!profile) return;

  // Offers are independent of the customer's profile. Start their request, but do
  // not hold back the name/points/avatar while the offers table responds.
  void loadCustomerHomeOffers();

  document.querySelectorAll("[data-name]").forEach(e => e.textContent = profile.full_name || "Customer");
  document.querySelectorAll("[data-points]").forEach(e => e.textContent = Math.min(50, Number(profile.points || 0)));
  document.querySelectorAll("[data-id]").forEach(e => e.textContent = profile.member_id || "—");

  // Keep the approved avatar inside the green points panel.
  const homeAvatar = $("homeAvatar");
  const avatarUrl = await getOwnAvatarUrl();
  renderAvatar(homeAvatar, profile.full_name, avatarUrl);

  // Home + Card merge: render the customer's personal QR directly below Home.
  // Some get_my_profile versions do not return loyalty_token, so fetch it directly as a fallback.
  const homeQr = $("homeQr");
  if (homeQr) {
    let loyaltyToken = profile.loyalty_token || null;
    if (!loyaltyToken) {
      try {
        const session = await getSession();
        const uid = session?.user?.id;
        if (uid) {
          const { data: tokenRow } = await sb.from("profiles")
            .select("loyalty_token")
            .eq("id", uid)
            .maybeSingle();
          loyaltyToken = tokenRow?.loyalty_token || null;
        }
      } catch {}
    }
    if (loyaltyToken && typeof QRCode !== "undefined") {
      homeQr.innerHTML = "";
      new QRCode(homeQr, {
        text: String(loyaltyToken),
        width: 230,
        height: 230,
        colorDark: "#073d2b",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    } else if (!loyaltyToken) {
      homeQr.innerHTML = '<div class="sub" style="padding:18px">QR code is unavailable for this account.</div>';
    }
  }
}

async function loadCustomerCard() {
  const profile = await guardRole(["customer"]);
  if (!profile) return;

  document.querySelectorAll("[data-name]").forEach(e => e.textContent = profile.full_name || "Customer");
  document.querySelectorAll("[data-id]").forEach(e => e.textContent = profile.member_id || "—");
  document.querySelectorAll("[data-points]").forEach(e => e.textContent = moneyPoints(profile.points));

  const qr = $("qr");
  if (qr && typeof QRCode !== "undefined") {
    qr.innerHTML = "";
    new QRCode(qr, {
      text: String(profile.loyalty_token),
      width: 270,
      height: 270,
      colorDark: "#073d2b",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  const copyBtn = $("copyToken");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      await navigator.clipboard?.writeText(String(profile.loyalty_token));
      toast("Customer QR token copied.");
    };
  }
}

async function loadCustomerProfile() {
  const profile = await guardRole(["customer"]);
  if (!profile) return;

  const { data: userData } = await sb.auth.getUser();
  const meta = userData?.user?.user_metadata || {};
  const birthday = profile.birthday || meta.birthday || "—";
  document.querySelectorAll("[data-name]").forEach(e => e.textContent = profile.full_name || meta.full_name || "Customer");
  document.querySelectorAll("[data-username]").forEach(e => e.textContent = profile.username || meta.username || profile.full_name || "—");
  document.querySelectorAll("[data-phone]").forEach(e => e.textContent = profile.phone || meta.phone || "—");
  document.querySelectorAll("[data-birthday]").forEach(e => e.textContent = birthday === "—" ? "—" : new Date(birthday + "T00:00:00").toLocaleDateString());
  document.querySelectorAll("[data-id]").forEach(e => e.textContent = profile.member_id || "—");
  document.querySelectorAll("[data-points]").forEach(e => e.textContent = moneyPoints(profile.points));

  const avatar = $("avatar");
  const avatarUrl = await getOwnAvatarUrl();
  renderAvatar(avatar, profile.full_name, avatarUrl);
  bindAvatarChoices(avatarUrl, profile.full_name);
  const avatarBtn=$("avatarBtn"), avatarInput=$("avatarInput");
  const avatarEditPanel=$("avatarEditPanel");
  const uploadAvatarBtn=$("uploadAvatarBtn");
  const closeAvatarPanelBtn=$("closeAvatarPanelBtn");

  if (avatarBtn && avatarEditPanel) {
    avatarBtn.onclick=()=>{
      avatarEditPanel.hidden=!avatarEditPanel.hidden;
      if (!avatarEditPanel.hidden) avatarEditPanel.scrollIntoView({behavior:"smooth",block:"nearest"});
    };
  }

  if (uploadAvatarBtn && avatarInput) {
    uploadAvatarBtn.onclick=()=>avatarInput.click();
    avatarInput.onchange=async()=>{
      const file=avatarInput.files?.[0]; if(!file)return;
      uploadAvatarBtn.disabled=true; uploadAvatarBtn.textContent="UPLOADING…";
      try {
        const url=await saveCustomerPhoto(file);
        renderAvatar(avatar, profile.full_name, url);
        toast("Profile photo updated.");
        if (avatarEditPanel) avatarEditPanel.hidden=true;
      }
      catch(e){ toast(e?.message||"Could not update photo.",false); }
      finally { uploadAvatarBtn.disabled=false; uploadAvatarBtn.textContent="UPLOAD MY PHOTO"; avatarInput.value=""; }
    };
  }

  if (closeAvatarPanelBtn && avatarEditPanel) {
    closeAvatarPanelBtn.onclick=()=>{ avatarEditPanel.hidden=true; };
  }

  const btn = $("changePasswordBtn");
  if (btn) btn.onclick = async () => {
    const next = $("newPassword")?.value || "";
    const confirm = $("confirmNewPassword")?.value || "";
    const msg = $("passwordMsg");
    if (next.length < 6) { msg.textContent = "Password must be at least 6 characters."; return; }
    if (next !== confirm) { msg.textContent = "Passwords do not match."; return; }
    btn.disabled = true; btn.textContent = "Updating…"; msg.textContent = "";
    const { error } = await sb.auth.updateUser({ password: next });
    if (error) { msg.textContent = error.message; btn.disabled = false; btn.textContent = "CHANGE PASSWORD"; return; }
    msg.textContent = "Password changed successfully.";
    $("newPassword").value = ""; $("confirmNewPassword").value = "";
    btn.disabled = false; btn.textContent = "CHANGE PASSWORD";
  };

  if (window.POACustomerAddresses?.initProfile) {
    await window.POACustomerAddresses.initProfile();
  }
}

async function loadCustomerLocations() {
  const profile = await guardRole(["customer"]);
  if (!profile) return;
  const box = $("customerLocations");
  if (!box) return;
  const { data, error } = await sb
    .from("locations")
    .select("id,name,city,address,phone,maps_url,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    box.innerHTML = `<div class="alert"><strong>Could not load branch locations.</strong><br>${esc(error.message)}</div>`;
    return;
  }
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    box.innerHTML = `<div class="locations-empty">No branch locations have been added yet.</div>`;
    return;
  }
  box.innerHTML = rows.map(location => {
    const address = [location.address, location.city].filter(Boolean).join(", ");
    const search = [location.name, address].filter(Boolean).join(" ");
    let mapsUrl = String(location.maps_url || "").trim();
    if (!/^https?:\/\//i.test(mapsUrl)) {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(search)}`;
    }
    const details = [address, location.phone ? `Phone: ${location.phone}` : ""].filter(Boolean).join(" · ");
    return `<a class="customer-branch" href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer"><span class="customer-branch-copy"><strong class="customer-branch-name">${esc(location.name || "Branch")}</strong>${details ? `<small class="customer-branch-meta">${esc(details)}</small>` : ""}</span><span class="customer-branch-map">OPEN MAP →</span></a>`;
  }).join("");
}

function rewardImageFallback(reward) {
  const labels = [reward?.title, reward?.name].filter(Boolean).join(" ").toLowerCase();
  const normalized = labels.replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized.includes("breakfast") && (normalized.includes("drink") || normalized.includes("beverage"))) {
    return "../assets/reward-breakfast-drink.jpg";
  }
  if (normalized.includes("breakfast")) {
    return "../assets/reward-breakfast.jpg";
  }
  if ((normalized.includes("hot") || normalized.includes("cold")) && normalized.includes("drink")) {
    return "../assets/reward-hot-cold.jpg";
  }
  return "../assets/reward-hot-cold.jpg";
}

function rewardImageFor(reward) {
  const saved = String(reward?.image_url || "").trim();
  return saved || rewardImageFallback(reward);
}

// Supabase may still contain an outdated image URL. Fall back to the matching
// local asset bundled with the site, without requiring a database update.
function handleRewardImageError(img) {
  if (!img) return;
  const fallback = String(img.dataset.fallbackSrc || "").trim();
  if (fallback && img.dataset.fallbackAttempted !== "true") {
    img.dataset.fallbackAttempted = "true";
    const absoluteFallback = new URL(fallback, document.baseURI).href;
    if (img.src !== absoluteFallback) {
      img.src = fallback;
      return;
    }
  }
  img.onerror = null;
  img.alt = "";
  img.classList.add("reward-image-unavailable");
}

async function loadCustomerRewards() {
  const profile = await guardRole(["customer"]);
  if (!profile) return;

  const box = $("rewards");
  if (!box) return;
  document.querySelectorAll("[data-points]").forEach(e => e.textContent = Math.min(50, Number(profile.points || 0)));

  const { data, error } = await sb
    .from("rewards")
    .select("id,title,name,description,points_cost,is_active,image_url")
    .eq("is_active", true)
    .order("points_cost", { ascending: true });

  if (error) {
    box.innerHTML = `<div class="card"><div class="alert">${esc(error.message)}</div></div>`;
    return;
  }

  const customerPoints = Math.min(50, Number(profile.points || 0));
  box.innerHTML = data?.length ? data.map(r => {
    const cost = Number(r.points_cost || 0);
    const canUse = customerPoints >= cost;
    const status = canUse ? "Available with your points" : `Need ${moneyPoints(cost - customerPoints)} more points`;
    const img = rewardImageFor(r);
    return `
      <div class="card reward-choice-card">
        <img class="reward-large-image" src="${esc(img)}" data-fallback-src="${esc(rewardImageFallback(r))}" alt="${esc(r.title || r.name || "Reward")}" onerror="handleRewardImageError(this)">
        <div class="reward-choice-body">
          <strong>${esc(r.title || r.name || "Reward")}</strong>
          <p>${esc(r.description || "Reward available")}</p>
          <div class="reward-points">${moneyPoints(cost)} points</div>
          <small class="reward-availability ${canUse ? "ready" : "wait"}">${esc(status)}</small>
        </div>
      </div>`;
  }).join("") : `<div class="card"><div class="empty">No rewards are active yet.</div></div>`;
}

function saveStaffCustomer(customer) {
  localStorage.setItem(KEYS.staffCustomer, JSON.stringify(customer));
}

function getStaffCustomer() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.staffCustomer) || "null");
  } catch {
    return null;
  }
}

async function lookupCustomerToken(token) {
  token = String(token || "").trim();

  if (!token) throw new Error("No QR token was provided.");

  // QR may contain a full URL.
  try {
    const u = new URL(token);
    const fromUrl = u.searchParams.get("token");
    if (fromUrl) token = fromUrl;
  } catch {}

  const { data, error } = await sb.rpc("get_customer_by_token", {
    p_token: token
  });

  if (error) throw error;

  const customer = Array.isArray(data) ? data[0] : data;

  if (!customer) throw new Error("Customer not found.");

  saveStaffCustomer(customer);
  return customer;
}

function renderStaffCustomer(customer) {
  if (!customer) return;

  document.querySelectorAll("[data-name]").forEach(e => e.textContent = customer.full_name || "Customer");
  document.querySelectorAll("[data-id]").forEach(e => e.textContent = customer.member_id || "—");
  document.querySelectorAll("[data-points]").forEach(e => e.textContent = moneyPoints(customer.points));

  const avatar = $("avatar");
  if (avatar) avatar.textContent = initials(customer.full_name);

  const status = $("customerStatus");
  if (status) status.textContent = customer.is_active ? "Active" : "Inactive";
}

async function loadStaffCustomer() {
  const profile = await guardRole(["staff","gm"]);
  if (!profile) return;

  const customer = getStaffCustomer();
  if (!customer) {
    location.href = "staff-scan.html";
    return;
  }

  renderStaffCustomer(customer);
}

async function loadAddPoints() {
  const profile = await guardRole(["staff","gm"]);
  if (!profile) return;

  const customer = getStaffCustomer();
  if (!customer) {
    location.href = "staff-scan.html";
    return;
  }

  renderStaffCustomer(customer);

  const btn = $("addPointsBtn");
  if (!btn) return;

  btn.onclick = async () => {
    const points = 1;
    const note = null;

    if (Number(customer.points || 0) >= 50) {
      toast("Customer has reached the maximum of 50 points.", false);
      return;
    }

    btn.disabled = true;
    btn.textContent = "Adding…";

    try {
      const staff = await getStaffProfile();
      const { data, error } = await sb.rpc("add_customer_point", {
        p_customer_id: customer.id,
        p_points: points,
        p_location_id: staff?.location_id || null,
        p_note: note
      });

      if (error) throw error;

      customer.points = data;
      saveStaffCustomer(customer);
      renderStaffCustomer(customer);
      toast("1 visit point added successfully.");
      setTimeout(() => location.href = "staff-customer.html", 500);
    } catch (e) {
      toast(e.message || "Could not add points.", false);
    } finally {
      btn.disabled = false;
      btn.textContent = "Add Points →";
    }
  };
}

async function loadStaffRedeem() {
  const profile = await guardRole(["staff","gm"]);
  if (!profile) return;

  const customer = getStaffCustomer();
  if (!customer) {
    location.href = "staff-scan.html";
    return;
  }

  renderStaffCustomer(customer);
  document.querySelectorAll("[data-points]").forEach(e => e.textContent = Math.min(50, Number(customer.points || 0)));

  const box = $("rewards");
  const { data, error } = await sb
    .from("rewards")
    .select("id,title,name,description,points_cost,is_active,image_url")
    .eq("is_active", true)
    .order("points_cost", { ascending: true });

  if (error) {
    box.innerHTML = `<div class="card"><div class="alert">${esc(error.message)}</div></div>`;
    return;
  }

  const customerPoints = Math.min(50, Number(customer.points || 0));
  box.innerHTML = data?.length ? data.map(r => {
    const cost = Number(r.points_cost || 0);
    const canRedeem = customerPoints >= cost;
    const img = rewardImageFor(r);
    return `
      <button type="button" class="card reward-choice-card staff-reward-select" data-reward-id="${esc(r.id)}" data-cost="${cost}">
        <img class="reward-large-image" src="${esc(img)}" data-fallback-src="${esc(rewardImageFallback(r))}" alt="${esc(r.title || r.name || "Reward")}" onerror="handleRewardImageError(this)">
        <span class="reward-choice-body">
          <strong>${esc(r.title || r.name || "Reward")}</strong>
          <span>${esc(r.description || "Reward available")}</span>
          <b class="reward-points">${moneyPoints(cost)} points</b>
          <small class="reward-availability ${canRedeem ? "ready" : "wait"}">${canRedeem ? "SELECT REWARD" : `Need ${moneyPoints(cost - customerPoints)} more points`}</small>
        </span>
      </button>`;
  }).join("") : `<div class="card"><div class="empty">No rewards are active.</div></div>`;

  box.querySelectorAll(".staff-reward-select").forEach(btn => {
    btn.onclick = () => openStaffRedemptionConfirm(btn.dataset.rewardId, Number(btn.dataset.cost));
  });
}

async function openStaffRedemptionConfirm(rewardId, cost) {
  const customer = getStaffCustomer();
  if (!customer) return;
  const current = Math.min(50, Number(customer.points || 0));
  if (current < cost) {
    toast(`Customer needs ${moneyPoints(cost - current)} more points.`, false);
    return;
  }
  const reward = document.querySelector(`.staff-reward-select[data-reward-id="${CSS.escape(rewardId)}"]`);
  const title = reward?.querySelector("strong")?.textContent || "Selected Reward";
  const confirmBox = $("redeemConfirm");
  if (!confirmBox) return;
  confirmBox.style.display = "block";
  confirmBox.innerHTML = `
    <h2 style="margin-top:0">Confirm Redemption</h2>
    <div class="card" style="background:#f7f5ee">
      <strong>${esc(customer.full_name || "Customer")}</strong>
      <p style="margin:8px 0"><b>${esc(title)}</b></p>
      <div class="grid g3" style="margin-top:12px">
        <div><small>Points Before</small><strong>${current}</strong></div>
        <div><small>Points Used</small><strong style="color:#a85d45">-${cost}</strong></div>
        <div><small>Points After</small><strong style="color:#2d7b55">${current-cost}</strong></div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <button class="btn gold" id="confirmRedeemBtn">Redeem & Deduct Points</button>
      <button class="btn soft" id="cancelRedeemBtn">Cancel</button>
    </div>`;
  confirmBox.scrollIntoView({behavior:"smooth",block:"nearest"});
  $("cancelRedeemBtn").onclick = () => { confirmBox.style.display="none"; };
  $("confirmRedeemBtn").onclick = async () => {
    const btn = $("confirmRedeemBtn");
    btn.disabled = true; btn.textContent = "REDEEMING…";
    try {
      const staff = await getStaffProfile();
      const { data, error } = await sb.rpc("redeem_customer_coupon", {
        p_customer_id: customer.id,
        p_reward_id: rewardId,
        p_location_id: staff?.location_id || null
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      const remaining = Number(result?.remaining_points ?? (current - cost));
      customer.points = Math.max(0, Math.min(50, remaining));
      saveStaffCustomer(customer);
      renderStaffCustomer(customer);
      document.querySelectorAll("[data-points]").forEach(e => e.textContent = customer.points);
      confirmBox.style.display = "none";
      const resultBox = $("redeemResult");
      if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
          <div style="text-align:center">
            <div style="font-size:48px">✓</div>
            <h2 style="color:#073a2b">Reward Redeemed Successfully</h2>
            <p>${esc(title)} has been redeemed for ${esc(customer.full_name || "Customer")}.</p>
            <div class="grid g3" style="margin:16px 0">
              <div><small>Points Before</small><strong>${current}</strong></div>
              <div><small>Points Used</small><strong style="color:#a85d45">-${cost}</strong></div>
              <div><small>Points After</small><strong style="color:#2d7b55">${customer.points}</strong></div>
            </div>
            <button class="btn primary block" onclick="loadStaffRedeem()">Redeem Another</button>
          </div>`;
        resultBox.scrollIntoView({behavior:"smooth",block:"nearest"});
      }
      toast("Reward redeemed and points deducted.", true);
    } catch (e) {
      btn.disabled = false; btn.textContent = "Redeem & Deduct Points";
      toast(e.message || "Could not redeem reward.", false);
    }
  };
}

async function loadStaffHistory() {
  const profile = await guardRole(["staff","gm"]);
  if (!profile) return;

  const customer = getStaffCustomer();
  const box = $("history");
  if (!box) return;

  if (!customer) {
    box.innerHTML = `<div class="empty">Scan a customer first to view their history.</div>`;
    return;
  }

  const staffProfile = await getStaffProfile();
  const currentStaffName = staffProfile?.full_name || "Staff";

  const { data, error } = await sb.rpc("get_customer_transactions", {
    p_customer_id: customer.id
  });

  if (error) {
    box.innerHTML = `<div class="alert">${esc(error.message)}</div>`;
    return;
  }

  if (!data?.length) {
    box.innerHTML = `<div class="empty">No transactions yet.</div>`;
    return;
  }

  // Some older transaction RPC versions return a staff/user id but not the
  // staff display name. Resolve those ids from profiles so the history always
  // shows the actual staff member when the RPC provides the id.
  const staffIds = [...new Set(data
    .map(t => t.staff_id || t.staff_user_id || t.created_by || t.user_id)
    .filter(Boolean))];

  let staffMap = {};
  if (staffIds.length) {
    const { data: staffRows } = await sb
      .from("profiles")
      .select("id,full_name,email")
      .in("id", staffIds);
    (staffRows || []).forEach(s => { staffMap[s.id] = s.full_name || s.email || "Staff"; });
  }

  box.innerHTML = `
    <table class="table">
      <thead><tr><th>Type</th><th>Points</th><th>Staff Member</th><th>Date</th></tr></thead>
      <tbody>
      ${data.map(t => {
        const staffId = t.staff_id || t.staff_user_id || t.created_by || t.user_id;
        const staffName = t.staff_member_name || t.staff_name || t.staff_member ||
          t.staff_email || (staffId ? staffMap[staffId] : "") || currentStaffName;
        return `
        <tr>
          <td>${esc(t.type)}</td>
          <td>${moneyPoints(t.points)}</td>
          <td>${esc(staffName)}</td>
          <td>${new Date(t.created_at).toLocaleString()}</td>
        </tr>`;
      }).join("")}
      </tbody>
    </table>`;
}

async function loadStaffProfile() {
  const profile = await guardRole(["staff","gm"]);
  if (!profile) return;

  const staff = await getStaffProfile().catch(() => profile);

  document.querySelectorAll("[data-name]").forEach(e => e.textContent = staff?.full_name || profile?.full_name || "Staff");
  document.querySelectorAll("[data-email]").forEach(e => e.textContent = staff?.email || profile?.email || "—");
  document.querySelectorAll("[data-role]").forEach(e => e.textContent = staff?.role || profile?.role || "—");
  document.querySelectorAll("[data-location]").forEach(e => e.textContent = staff?.location_name || "Not assigned");
  await bindStaffPhoto(profile);
}

async function bindStaffPhoto(profile) {
  const avatar = $("staffAvatar");
  const nameEl = $("staffName");
  const input = $("staffAvatarInput");
  const button = $("staffAvatarBtn");
  const msg = $("staffPhotoMsg");
  if (!avatar || !input || !button) return;

  const staff = profile?.role === "admin" ? profile : (await getStaffProfile().catch(() => profile));
  const name = staff?.full_name || profile?.full_name || "Staff";
  if (nameEl) nameEl.textContent = name;
  const url = await getOwnAvatarUrl();
  renderAvatar(avatar, name, url);
  avatar.classList.add("staff-avatar-frame");

  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    button.disabled = true;
    button.textContent = "UPLOADING…";
    if (msg) msg.textContent = "";
    try {
      const saved = await saveCustomerPhoto(file);
      renderAvatar(avatar, name, saved);
      avatar.classList.add("staff-avatar-frame");
      if (msg) msg.textContent = "Profile photo updated successfully.";
    } catch (e) {
      if (msg) msg.textContent = e?.message || "Could not update photo.";
    } finally {
      button.disabled = false;
      button.textContent = "ADD / CHANGE PHOTO";
      input.value = "";
    }
  };
}

async function startScanner() {
  const profile = await guardRole(["staff","gm"]);
  if (!profile) return;
  await bindStaffPhoto(profile);

  const result = $("scanResult");
  const input = $("manualToken");
  const manualBtn = $("manualBtn");

  manualBtn.onclick = async () => {
    try {
      const c = await lookupCustomerToken(input.value);
      result.innerHTML = `<div class="alert ok">Customer found: <b>${esc(c.full_name)}</b></div>`;
      setTimeout(() => location.href = "staff-customer.html", 400);
    } catch (e) {
      result.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
    }
  };

  const reader = $("reader");
  if (!reader || typeof Html5Qrcode === "undefined") return;

  const scanner = new Html5Qrcode("reader");

  const onScan = async (decodedText) => {
    try {
      await scanner.stop();
    } catch {}

    try {
      const c = await lookupCustomerToken(decodedText);
      result.innerHTML = `<div class="alert ok">Customer found: <b>${esc(c.full_name)}</b></div>`;
      setTimeout(() => location.href = "staff-customer.html", 400);
    } catch (e) {
      result.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
    }
  };

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      onScan,
      () => {}
    );
  } catch (e) {
    result.innerHTML =
      `<div class="note">Camera could not start. Allow camera permission or use manual token entry below.</div>`;
  }
}

async function getAdminProfiles() {
  const { data, error } = await sb.from("profiles")
    .select("id,full_name,email,phone,member_id,role,points,is_active,created_at,avatar_url")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadGmDashboard() {
  const profile = await guardRole(["gm"]);
  if (!profile) return;

  const todayEl = $("registrationsToday");
  const weekEl = $("registrationsWeek");
  const monthEl = $("registrationsMonth");
  const totalEl = $("registrations24hTotal");
  const averageEl = $("registrationsHourlyAverage");
  const chart = $("gmHourlyChart");
  const notice = $("gmRegistrationNotice");
  const refresh = $("refreshGmRegistrations");
  let refreshing = false;

  const countBetween = async (start, end) => {
    let query = sb.from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer")
      .gte("created_at", start.toISOString());
    if (end) query = query.lt("created_at", end.toISOString());
    const { count, error } = await query;
    if (error) throw error;
    return Number(count || 0);
  };

  const render = async () => {
    if (refreshing) return;
    refreshing = true;
    if (refresh) { refresh.disabled = true; refresh.textContent = "Loading…"; }
    if (chart) chart.innerHTML = '<div class="sub">Loading hourly registrations…</div>';
    if (notice) notice.textContent = "Loading new customer registration data…";

    try {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startWeek = new Date(startToday);
      const daysSinceMonday = (startWeek.getDay() + 6) % 7;
      startWeek.setDate(startWeek.getDate() - daysSinceMonday);
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Display 24 complete, local-time hour buckets. The current partial hour is excluded
      // so the hourly average is always based on a full 24-hour observation window.
      const endHour = new Date(now);
      endHour.setMinutes(0, 0, 0);
      const startHour = new Date(endHour.getTime() - 24 * 60 * 60 * 1000);
      const hours = Array.from({ length: 24 }, (_, i) => ({
        start: new Date(startHour.getTime() + i * 60 * 60 * 1000),
        end: new Date(startHour.getTime() + (i + 1) * 60 * 60 * 1000),
        count: 0
      }));

      // Exact head counts avoid API row-limit problems and count profile creation, not point transactions.
      const [todayCount, weekCount, monthCount, ...hourCounts] = await Promise.all([
        countBetween(startToday, now),
        countBetween(startWeek, now),
        countBetween(startMonth, now),
        ...hours.map(hour => countBetween(hour.start, hour.end))
      ]);

      hours.forEach((hour, i) => { hour.count = Number(hourCounts[i] || 0); });
      if (todayEl) todayEl.textContent = moneyPoints(todayCount);
      if (weekEl) weekEl.textContent = moneyPoints(weekCount);
      if (monthEl) monthEl.textContent = moneyPoints(monthCount);

      const total = hours.reduce((sum, hour) => sum + hour.count, 0);
      if (totalEl) totalEl.textContent = moneyPoints(total);
      if (averageEl) averageEl.textContent = (total / 24).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

      if (chart) {
        const maxCount = Math.max(1, ...hours.map(hour => hour.count));
        chart.innerHTML = hours.map((hour, index) => {
          const height = hour.count === 0 ? 3 : Math.max(7, Math.round((hour.count / maxCount) * 130));
          const label = hour.start.toLocaleTimeString([], { hour: "numeric" });
          const showLabel = index % 3 === 0 || index === 23;
          const title = `${hour.start.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric" })}–${hour.end.toLocaleTimeString([], { hour: "numeric" })}: ${hour.count} new customer${hour.count === 1 ? "" : "s"}`;
          return `<div class="gm-hour-slot" title="${esc(title)}"><div class="gm-hour-track"><span class="gm-hour-value" style="--bar-height:${height}px">${hour.count ? esc(hour.count) : ""}</span><span class="gm-hour-bar${hour.count ? " has-registrations" : ""}" style="--bar-height:${height}px;height:${height}px" aria-hidden="true"></span></div><span class="gm-hour-label">${showLabel ? esc(label) : ""}</span></div>`;
        }).join("");
      }

      if (notice) {
        notice.textContent = total === 0
          ? "No new customer registrations were recorded in the last 24 completed hours. Weekly and monthly totals above still include earlier registrations."
          : `${total} new customer${total === 1 ? "" : "s"} registered in the last 24 completed hours, averaging ${(total / 24).toFixed(1)} new customers per hour. The current incomplete hour is excluded.`;
      }
    } catch (error) {
      if (chart) chart.innerHTML = '<div class="gm-registration-error">Could not load registration analytics. Check the profiles table read permission for the GM account, then refresh.</div>';
      if (notice) notice.textContent = error?.message || "Could not load customer registration data.";
      [todayEl, weekEl, monthEl, totalEl, averageEl].forEach(el => { if (el) el.textContent = "—"; });
      toast(error?.message || "Could not load customer registration analytics.", false);
    } finally {
      refreshing = false;
      if (refresh) { refresh.disabled = false; refresh.textContent = "Refresh"; }
    }
  };

  if (refresh) refresh.onclick = render;
  await render();
}

async function loadGmMembers() {
  const profile = await guardRole(["gm"]);
  if (!profile) return;

  const box = $("members");
  const search = $("search");

  async function render() {
    const q = search.value.trim();

    let query = sb
      .from("profiles")
      .select("id,full_name,phone,member_id,points,is_active,created_at")
      .eq("role","customer")
      .order("created_at",{ascending:false});

    if (q) {
      query = query.or(
        `full_name.ilike.%${q}%,phone.ilike.%${q}%,member_id.ilike.%${q}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      box.innerHTML = `<div class="alert">${esc(error.message)}</div>`;
      return;
    }

    box.innerHTML = data?.length ? data.map(m => `
      <div class="row" style="padding:13px 0;border-bottom:1px solid var(--line)">
        <div class="avatar">${esc(initials(m.full_name))}</div>
        <div class="grow">
          <strong>${esc(m.full_name || "Customer")}</strong>
          <small>${esc(m.member_id || "—")} • ${esc(m.phone || "—")}</small>
        </div>
        <span class="badge">${moneyPoints(m.points)} pts</span>
      </div>
    `).join("") : `<div class="empty">No members found.</div>`;
  }

  search.oninput = render;
  await render();
}

async function loadGmLocations() {
  const profile = await guardRole(["gm"]);
  if (!profile) return;

  const box = $("gmLocationsList");
  const formTitle = $("gmLocationFormTitle");
  const idInput = $("gmLocationId");
  const nameInput = $("gmLocationName");
  const cityInput = $("gmLocationCity");
  const addressInput = $("gmLocationAddress");
  const phoneInput = $("gmLocationPhone");
  const mapsInput = $("gmLocationMapsUrl");
  const activeInput = $("gmLocationActive");
  const saveButton = $("gmLocationSaveBtn");
  const cancelButton = $("gmLocationCancelBtn");
  const message = $("gmLocationMessage");
  const refreshButton = $("gmLocationRefreshBtn");
  const staffAssignmentsBox = $("gmStaffAssignments");
  const staffAssignmentMessage = $("gmStaffAssignmentMessage");
  const staffAssignmentsRefreshButton = $("gmStaffAssignmentsRefreshBtn");
  if (!box || !saveButton || !nameInput) return;

  let locations = [];
  const setMessage = (text, bad = false) => {
    if (!message) return;
    message.textContent = text;
    message.style.color = bad ? "#a33" : "";
  };
  const clearForm = () => {
    idInput.value = "";
    nameInput.value = "";
    cityInput.value = "";
    addressInput.value = "";
    phoneInput.value = "";
    mapsInput.value = "";
    activeInput.checked = true;
    if (formTitle) formTitle.textContent = "Add Branch Location";
    saveButton.textContent = "SAVE BRANCH";
    if (cancelButton) cancelButton.hidden = true;
    setMessage("");
  };
  const mapLinkFor = location => {
    const explicit = String(location.maps_url || "").trim();
    if (/^https?:\/\//i.test(explicit)) return explicit;
    const query = [location.name, location.address, location.city].filter(Boolean).join(" ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };
  const render = () => {
    if (!locations.length) {
      box.innerHTML = '<div class="branch-empty">No branches yet. Add your first real branch above.</div>';
      return;
    }
    box.innerHTML = locations.map(location => {
      const address = [location.address, location.city].filter(Boolean).join(", ");
      const detail = [address, location.phone ? `Phone: ${location.phone}` : ""].filter(Boolean).join(" · ");
      return `<article class="branch-manage-card"><div class="branch-card-top"><div class="branch-card-icon" aria-hidden="true">⌖</div><div class="grow"><h4 class="branch-card-title">${esc(location.name || "Branch")}</h4>${detail ? `<small class="branch-card-meta">${esc(detail)}</small>` : ""}<small class="branch-card-meta">${location.is_active ? "Active · visible to customers" : "Inactive · hidden from customers"}</small></div></div><div class="branch-card-actions"><a class="btn soft" href="${esc(mapLinkFor(location))}" target="_blank" rel="noopener noreferrer">OPEN MAP</a><button class="btn" type="button" data-location-edit="${esc(location.id)}">EDIT</button><button class="btn danger" type="button" data-location-delete="${esc(location.id)}">DELETE</button></div></article>`;
    }).join("");
    box.querySelectorAll("[data-location-edit]").forEach(button => button.addEventListener("click", () => {
      const location = locations.find(row => row.id === button.dataset.locationEdit);
      if (!location) return;
      idInput.value = location.id;
      nameInput.value = location.name || "";
      cityInput.value = location.city || "";
      addressInput.value = location.address || "";
      phoneInput.value = location.phone || "";
      mapsInput.value = location.maps_url || "";
      activeInput.checked = location.is_active !== false;
      if (formTitle) formTitle.textContent = "Edit Branch Location";
      saveButton.textContent = "SAVE CHANGES";
      if (cancelButton) cancelButton.hidden = false;
      setMessage("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    box.querySelectorAll("[data-location-delete]").forEach(button => button.addEventListener("click", async () => {
      const location = locations.find(row => row.id === button.dataset.locationDelete);
      if (!location || !confirm(`Delete branch “${location.name}”? It will no longer appear to customers.`)) return;
      button.disabled = true;
      const { error } = await sb.from("locations").delete().eq("id", location.id);
      if (error) {
        setMessage(`Could not delete branch: ${error.message}`, true);
        button.disabled = false;
        return;
      }
      if (idInput.value === location.id) clearForm();
      setMessage("Branch deleted.");
      await load();
    }));
  };
  const load = async () => {
    box.innerHTML = '<div class="branch-empty">Loading branches…</div>';
    const { data, error } = await sb.from("locations")
      .select("id,name,city,address,phone,maps_url,is_active,created_at,updated_at")
      .order("name", { ascending: true });
    if (error) {
      box.innerHTML = `<div class="alert">Could not load branches. Run the latest POACustomers menu/location setup SQL, then refresh. Details: ${esc(error.message)}</div>`;
      return;
    }
    locations = Array.isArray(data) ? data : [];
    render();
  };

  const setStaffAssignmentMessage = (text, bad = false) => {
    if (!staffAssignmentMessage) return;
    staffAssignmentMessage.textContent = text;
    staffAssignmentMessage.style.color = bad ? "#a33" : "";
  };

  const loadStaffAssignments = async () => {
    if (!staffAssignmentsBox) return;
    staffAssignmentsBox.innerHTML = '<div class="branch-empty">Loading Staff assignments…</div>';
    setStaffAssignmentMessage("");
    const { data, error } = await sb.rpc("list_staff_branch_assignments");
    if (error) {
      staffAssignmentsBox.innerHTML = `<div class="alert">Could not load Staff assignments. Run the latest POACustomers-pickup-orders-setup.sql. Details: ${esc(error.message)}</div>`;
      return;
    }
    const staffRows = Array.isArray(data) ? data : [];
    if (!staffRows.length) {
      staffAssignmentsBox.innerHTML = '<div class="branch-empty">No Staff accounts found yet. Create Staff accounts before assigning branches.</div>';
      return;
    }
    const activeLocations = locations.filter(loc => loc.is_active !== false);
    staffAssignmentsBox.innerHTML = staffRows.map(staff => {
      const label = staff.full_name || staff.email || staff.phone || 'Staff member';
      const currentId = staff.location_id || '';
      const currentInactive = currentId && !activeLocations.some(loc => String(loc.id) === String(currentId));
      const inactiveLabel = currentInactive ? `<option value="${esc(currentId)}" selected disabled>${esc(staff.location_name || 'Inactive branch')} (inactive — reassign)</option>` : '';
      const currentOptions = activeLocations.map(loc => `<option value="${esc(loc.id)}" ${String(loc.id) === String(currentId) ? 'selected' : ''}>${esc(loc.name || 'Branch')}${loc.city ? ' — ' + esc(loc.city) : ''}</option>`).join('');
      const selectedExists = activeLocations.some(loc => String(loc.id) === String(currentId));
      const unassignedSelected = !currentId;
      return `<article class="branch-manage-card"><div class="branch-card-top"><div class="branch-card-icon" aria-hidden="true">●</div><div class="grow"><h4 class="branch-card-title">${esc(label)}</h4><small class="branch-card-meta">${esc(staff.email || staff.phone || 'Staff account')}${staff.phone && staff.email ? ' · ' + esc(staff.phone) : ''}</small><small class="branch-card-meta">${staff.staff_active ? 'Active Staff account' : 'Inactive Staff account'}</small></div></div><label class="field" style="display:block;margin-top:12px">Assigned branch<select class="input" data-staff-assignment="${esc(staff.staff_id)}" data-current-location="${esc(currentId)}" style="margin-top:6px" ${staff.staff_active ? '' : 'disabled'}><option value="" ${unassignedSelected ? 'selected' : ''}>Not assigned</option>${inactiveLabel}${currentOptions}</select></label><small class="branch-card-meta">${selectedExists ? 'Orders will be routed to this branch.' : (currentInactive ? 'This assignment points to an inactive branch; choose an active branch.' : 'No orders will appear until a branch is assigned.')}</small></article>`;
    }).join('');
    staffAssignmentsBox.querySelectorAll('[data-staff-assignment]').forEach(select => select.addEventListener('change', async () => {
      const staffId = select.dataset.staffAssignment;
      const previous = select.dataset.currentLocation || '';
      const next = select.value || null;
      if (String(next || '') === String(previous)) return;
      select.disabled = true;
      try {
        const { error: assignError } = await sb.rpc('assign_staff_to_branch', { p_staff_id: staffId, p_location_id: next });
        if (assignError) throw assignError;
        setStaffAssignmentMessage('Staff branch assignment saved. This Staff account will only receive orders for its assigned branch.');
        await loadStaffAssignments();
      } catch (e) {
        select.value = previous;
        setStaffAssignmentMessage(e?.message || 'Could not save the Staff branch assignment.', true);
        select.disabled = false;
      }
    }));
  };

  saveButton.onclick = async () => {
    const name = nameInput.value.trim();
    const mapsUrl = mapsInput.value.trim();
    if (!name) { setMessage("Branch name is required.", true); nameInput.focus(); return; }
    if (mapsUrl) {
      try {
        const parsed = new URL(mapsUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch { setMessage("Enter a valid Google Maps URL beginning with https:// or leave it blank.", true); mapsInput.focus(); return; }
    }
    saveButton.disabled = true;
    const originalText = saveButton.textContent;
    saveButton.textContent = "SAVING…";
    try {
      const payload = {
        name,
        city: cityInput.value.trim() || null,
        address: addressInput.value.trim() || null,
        phone: phoneInput.value.trim() || null,
        maps_url: mapsUrl || null,
        is_active: Boolean(activeInput.checked)
      };
      const id = idInput.value.trim();
      const result = id
        ? await sb.from("locations").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id)
        : await sb.from("locations").insert(payload);
      if (result.error) throw result.error;
      clearForm();
      setMessage(id ? "Branch updated successfully." : "Branch added successfully.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Could not save branch. Check branch table permissions in Supabase.", true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = originalText === "SAVE CHANGES" ? "SAVE BRANCH" : originalText;
      if (idInput.value) saveButton.textContent = "SAVE CHANGES";
    }
  };
  if (cancelButton) cancelButton.onclick = clearForm;
  if (refreshButton) refreshButton.onclick = async () => { await load(); await loadStaffAssignments(); };
  if (staffAssignmentsRefreshButton) staffAssignmentsRefreshButton.onclick = loadStaffAssignments;
  await load();
  await loadStaffAssignments();
}

async function loadAdminDashboard() {
  const profile = await guardRole(["admin"]);
  if (!profile) return;

  const chart = $("registrationMinuteChart");
  const message = $("registrationChartMessage");
  const refresh = $("refreshRegistrations");
  const todayEl = $("registrationsToday");
  const weekEl = $("registrationsWeek");
  const monthEl = $("registrationsMonth");

  const renderRegistrations = async () => {
    if (chart) chart.innerHTML = '<div class="sub">Loading registration data…</div>';
    if (message) message.textContent = "";
    try {
      // Read actual customer profile creation timestamps. Point transactions are intentionally not used.
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfToday);
      const day = (startOfWeek.getDay() + 6) % 7; // Monday is the first day of the week.
      startOfWeek.setDate(startOfWeek.getDate() - day);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startMinute = new Date(now);
      startMinute.setSeconds(0, 0);
      startMinute.setMinutes(startMinute.getMinutes() - 59);

      const queryStart = new Date(Math.min(startOfMonth.getTime(), startMinute.getTime()));
      const { data, error } = await sb.from("profiles")
        .select("created_at")
        .eq("role", "customer")
        .gte("created_at", queryStart.toISOString())
        .lte("created_at", now.toISOString())
        .order("created_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const dates = rows.map(row => new Date(row.created_at)).filter(date => !Number.isNaN(date.getTime()));
      const countFrom = (start) => dates.filter(date => date >= start && date <= now).length;

      if (todayEl) todayEl.textContent = moneyPoints(countFrom(startOfToday));
      if (weekEl) weekEl.textContent = moneyPoints(countFrom(startOfWeek));
      if (monthEl) monthEl.textContent = moneyPoints(countFrom(startOfMonth));

      if (chart) {
        const buckets = Array.from({ length: 60 }, (_, i) => {
          const minute = new Date(startMinute.getTime() + i * 60000);
          return { minute, label: minute.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), value: 0 };
        });
        dates.forEach(date => {
          const rounded = new Date(date);
          rounded.setSeconds(0, 0);
          const index = Math.floor((rounded.getTime() - startMinute.getTime()) / 60000);
          if (index >= 0 && index < buckets.length) buckets[index].value += 1;
        });
        const max = Math.max(1, ...buckets.map(bucket => bucket.value));
        chart.innerHTML = buckets.map((bucket, index) => {
          const height = bucket.value === 0 ? 3 : Math.max(7, Math.round((bucket.value / max) * 104));
          const fullLabel = `${bucket.label}: ${bucket.value} new customer${bucket.value === 1 ? "" : "s"}`;
          const tick = index % 10 === 0 || index === 59;
          return `<div class="registration-minute" title="${esc(fullLabel)}"><span class="registration-minute-value">${bucket.value ? esc(bucket.value) : ""}</span><span class="registration-minute-bar${bucket.value ? " has-registrations" : ""}" style="height:${height}px" aria-hidden="true"></span><span class="registration-minute-tick">${tick ? esc(bucket.label) : ""}</span></div>`;
        }).join("");
        const totalLastHour = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
        if (message) message.textContent = `${totalLastHour} new customer${totalLastHour === 1 ? "" : "s"} registered in the last 60 minutes. This chart counts account registrations, not loyalty points.`;
      }
    } catch (e) {
      if (chart) chart.innerHTML = '<div class="alert">Could not load customer registration data.</div>';
      if (message) message.textContent = e?.message || "Check the profiles table read permissions for the admin account.";
      [todayEl, weekEl, monthEl].forEach(el => { if (el) el.textContent = "—"; });
      toast(e.message || "Could not load customer registration data.", false);
    }
  };

  if (refresh) refresh.onclick = renderRegistrations;
  await renderRegistrations();
}
async function loadAdminUsers() {
  const profile = await guardRole(["admin"]); if (!profile) return;
  const box = $("adminUsers"), search = $("adminSearch");
  async function render() {
    const q = search.value.trim().toLowerCase();
    let data;
    try {
      data = (await getAdminProfiles()).filter(u => String(u.role || "").toLowerCase() !== "customer");
    } catch (e) {
      box.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
      return;
    }
    if (q) {
      data = data.filter(u => [u.full_name,u.phone,u.member_id,u.role,u.email].some(v => String(v || "").toLowerCase().includes(q)));
    }
    box.innerHTML = data.length ? data.map(u => `
      <div class="row" style="padding:13px 0;border-bottom:1px solid var(--line)">
        <div class="avatar">${esc(initials(u.full_name))}</div>
        <div class="grow"><strong>${esc(u.full_name || "User")}</strong><small>${esc(u.member_id || "—")} • ${esc(u.phone || u.email || "—")}</small></div>
        <span class="badge">${esc(String(u.role || "—").toLowerCase())}</span>
      </div>`).join("") : `<div class="empty">No staff or management accounts found.</div>`;
  }
  search.oninput = render; await render();
}

async function loadAdminRoleList(role, target) {
  const profile = await guardRole(["admin"]); if (!profile) return;
  const box = $(target);
  let data;
  try {
    data = (await getAdminProfiles()).filter(u => String(u.role || "").toLowerCase() === role);
  } catch (e) {
    box.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
    return;
  }
  const portalHref = role === "gm" ? "../gm/gm-dashboard.html" : "../staff/staff-scan.html";
  box.innerHTML = data.length ? data.map(u => `
    <a class="row admin-portal-row" href="${portalHref}" style="padding:13px 0;border-bottom:1px solid var(--line)">
      <div class="avatar">${esc(initials(u.full_name))}</div>
      <div class="grow"><strong>${esc(u.full_name || role.toUpperCase())}</strong><small>${esc(u.email || "—")} • ${esc(u.phone || u.member_id || "—")}</small></div>
      <span class="badge">${u.is_active ? "Active" : "Inactive"}</span>
    </a>`).join("") : `<div class="empty">No ${role.toUpperCase()} accounts found.</div>`;
}

async function bindGmSettingsProfile() {
  const profile = await guardRole(["gm"]);
  if (!profile) return;

  document.querySelectorAll("[data-gm-name]").forEach(e => e.textContent = profile.full_name || "General Manager");
  document.querySelectorAll("[data-gm-email]").forEach(e => e.textContent = profile.email || "—");

  const avatar = $("gmAvatar");
  const input = $("gmAvatarInput");
  const button = $("gmAvatarBtn");
  const msg = $("gmPhotoMsg");
  if (!avatar || !input || !button) return;

  const url = await getOwnAvatarUrl();
  renderAvatar(avatar, profile.full_name || "General Manager", url);
  avatar.classList.add("gm-avatar-frame");

  button.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    button.disabled = true;
    button.textContent = "UPLOADING…";
    if (msg) msg.textContent = "";
    try {
      const saved = await saveCustomerPhoto(file);
      renderAvatar(avatar, profile.full_name || "General Manager", saved);
      avatar.classList.add("gm-avatar-frame");
      if (msg) msg.textContent = "Profile photo updated successfully.";
    } catch (e) {
      if (msg) msg.textContent = e?.message || "Could not update photo.";
    } finally {
      button.disabled = false;
      button.textContent = "ADD / CHANGE PHOTO";
      input.value = "";
    }
  };
}

async function init() {
  const page = document.body.dataset.page;
  bindCustomerNav(page);
  try {
    if (page === "admin-login") {
      $("loginBtn").onclick = () => login("admin");
    } else if (page === "admin-dashboard") {
      await loadAdminDashboard();
    } else if (page === "admin-users") {
      await loadAdminUsers();

    } else if (page === "admin-staff") {
      await loadAdminRoleList("staff", "adminStaffList");
    } else if (page === "admin-settings") {
      await guardRole(["admin"]);
    } else if (page === "customer-login") {
      $("loginBtn").onclick = () => login("customer");
    } else if (page === "customer-register") {
      $("registerBtn").onclick = registerCustomer;
      if (window.POACustomerAddresses?.initRegistration) await window.POACustomerAddresses.initRegistration();
    } else if (page === "customer-home") {
      await loadCustomerHome();
    } else if (page === "customer-card") {
      await loadCustomerCard();
    } else if (page === "customer-profile") {
      await loadCustomerProfile();
    } else if (page === "customer-rewards") {
      await loadCustomerRewards();
    } else if (page === "customer-menu") {
      await guardRole(["customer"]);
    } else if (page === "customer-locations") {
      await loadCustomerLocations();
    } else if (page === "staff-login") {
      $("loginBtn").onclick = () => login("staff");
    } else if (page === "staff-scan") {
      await startScanner();
    } else if (page === "staff-customer") {
      await loadStaffCustomer();
    } else if (page === "staff-add-points") {
      await loadAddPoints();
    } else if (page === "staff-redeem") {
      await loadStaffRedeem();
    } else if (page === "staff-history") {
      await loadStaffHistory();
    } else if (page === "staff-profile") {
      await loadStaffProfile();
    } else if (page === "gm-login") {
      $("loginBtn").onclick = () => login("gm");
    } else if (page === "gm-dashboard") {
      await loadGmDashboard();
    } else if (page === "gm-members") {
      await loadGmMembers();
    } else if (page === "gm-locations") {
      await loadGmLocations();
    } else if (page === "gm-settings") {
      await bindGmSettingsProfile();
    } else if (page === "gm-categories") {
      await guardRole(["gm"]);
    } else if (page === "gm-menu") {
      await guardRole(["gm"]);
    } else if (page === "gm-offers") {
      await guardRole(["gm"]);
    }
  } catch (e) {
    console.error(e);
    const msg = $("msg");
    if (msg) msg.textContent = e.message || "Something went wrong.";
    else toast(e.message || "Something went wrong.", false);
  }
}

document.addEventListener("DOMContentLoaded", init);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(location.pathname.includes("/customer/") || location.pathname.includes("/gm/") || location.pathname.includes("/staff/") || location.pathname.includes("/admin/") ? "../sw.js" : "./sw.js").catch(() => {}));
}
