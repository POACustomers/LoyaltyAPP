/* POACustomers automatic customer-home offers slideshow.
   Loads only active, currently valid offers from public.offers.
   Uses the existing Supabase client already initialized by the app. */
(() => {
  "use strict";
  const STYLE_ID = "poa-offers-slideshow-style";
  const ROOT_ID = "poa-offers-slideshow";
  const ROTATE_MS = 10000;
  let timer = null;
  let current = 0;
  let offers = [];
  let paused = false;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "../assets/customer-offers-slideshow.css?v=20261022-auto-slider";
    document.head.appendChild(link);
  }

  function getClient() {
    // `sb` is the existing Supabase client used by POACustomers assets/app.js.
    try { if (typeof sb !== "undefined" && sb) return sb; } catch (_) {}
    return window.supabaseClient || window.sb || null;
  }

  function findMount() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.className = "poa-offers";
    root.setAttribute("aria-label", "Current offers");
    const main = document.querySelector("main.container, main .container, main, .container");
    if (main) {
      const first = main.firstElementChild;
      if (first) main.insertBefore(root, first);
      else main.appendChild(root);
    } else {
      document.body.insertBefore(root, document.body.firstChild);
    }
    return root;
  }

  function render() {
    const root = findMount();
    if (!offers.length) {
      root.hidden = true;
      root.innerHTML = "";
      stop();
      return;
    }
    root.hidden = false;
    if (current >= offers.length) current = 0;
    const item = offers[current];
    const dots = offers.length > 1
      ? `<div class="poa-offers__dots" aria-label="Offer slides">${offers.map((_, i) =>
          `<button type="button" class="poa-offers__dot${i === current ? " is-active" : ""}" data-slide="${i}" aria-label="Go to offer ${i+1}" aria-current="${i === current ? "true" : "false"}"></button>`
        ).join("")}</div>` : "";
    root.innerHTML = `
      <div class="poa-offers__heading"><span>عروض مميزة ليك</span><span class="poa-offers__count">${current+1} / ${offers.length}</span></div>
      <div class="poa-offers__viewport" role="region" aria-roledescription="carousel" aria-label="عروض العملاء" tabindex="0">
        <button class="poa-offers__arrow poa-offers__prev" type="button" aria-label="العرض السابق" ${offers.length < 2 ? "hidden" : ""}>‹</button>
        <button class="poa-offers__slide" type="button" aria-label="عرض تفاصيل ${esc(item.title || item.product_name)}">
          <span class="poa-offers__copy">
            <span class="poa-offers__eyebrow">عرض لفترة محدودة</span>
            <strong class="poa-offers__title">${esc(item.title || item.product_name || "عرض خاص")}</strong>
            ${item.product_name && item.title ? `<span class="poa-offers__product">${esc(item.product_name)}</span>` : ""}
            ${item.description ? `<span class="poa-offers__description">${esc(item.description)}</span>` : ""}
            <span class="poa-offers__cta">اعرف تفاصيل العرض <b aria-hidden="true">←</b></span>
          </span>
          ${item.image_url ? `<img class="poa-offers__image" src="${esc(item.image_url)}" alt="${esc(item.product_name || item.title || "صورة العرض")}" loading="${current === 0 ? "eager" : "lazy"}" onerror="this.hidden=true">` : `<span class="poa-offers__image-placeholder" aria-hidden="true">★</span>`}
        </button>
        <button class="poa-offers__arrow poa-offers__next" type="button" aria-label="العرض التالي" ${offers.length < 2 ? "hidden" : ""}>›</button>
      </div>
      ${dots}
      <div class="poa-offers__modal" hidden role="dialog" aria-modal="true" aria-label="تفاصيل العرض">
        <button class="poa-offers__modal-close" type="button" aria-label="إغلاق">×</button>
        <div class="poa-offers__modal-content"></div>
      </div>`;
    bind(root);
    if (!paused) start();
  }

  function openDetails(root) {
    const item = offers[current];
    if (!item) return;
    const modal = root.querySelector(".poa-offers__modal");
    const content = root.querySelector(".poa-offers__modal-content");
    content.innerHTML = `
      ${item.image_url ? `<img class="poa-offers__detail-image" src="${esc(item.image_url)}" alt="${esc(item.product_name || item.title || "صورة العرض")}">` : ""}
      <p class="poa-offers__eyebrow">تفاصيل العرض</p>
      <h3>${esc(item.title || item.product_name || "عرض خاص")}</h3>
      ${item.product_name && item.title ? `<p><strong>المنتج:</strong> ${esc(item.product_name)}</p>` : ""}
      ${item.description ? `<p>${esc(item.description)}</p>` : ""}
      <p class="poa-offers__validity">ساري من ${esc(item.production_date || "—")} إلى ${esc(item.expiry_date || "—")}</p>`;
    modal.hidden = false;
    stop();
    const close = modal.querySelector(".poa-offers__modal-close");
    close.focus();
  }

  function bind(root) {
    root.querySelector(".poa-offers__prev")?.addEventListener("click", e => {
      e.stopPropagation(); current = (current - 1 + offers.length) % offers.length; render();
    });
    root.querySelector(".poa-offers__next")?.addEventListener("click", e => {
      e.stopPropagation(); current = (current + 1) % offers.length; render();
    });
    root.querySelector(".poa-offers__slide")?.addEventListener("click", () => openDetails(root));
    root.querySelectorAll("[data-slide]").forEach(button => button.addEventListener("click", () => {
      current = Number(button.dataset.slide) || 0; render();
    }));
    const viewport = root.querySelector(".poa-offers__viewport");
    let startX = null;
    viewport?.addEventListener("touchstart", e => { startX = e.changedTouches[0]?.clientX ?? null; }, {passive:true});
    viewport?.addEventListener("touchend", e => {
      if (startX === null || offers.length < 2) return;
      const delta = (e.changedTouches[0]?.clientX ?? startX) - startX;
      if (Math.abs(delta) > 45) {
        current = delta < 0 ? (current + 1) % offers.length : (current - 1 + offers.length) % offers.length;
        render();
      }
      startX = null;
    }, {passive:true});
    root.addEventListener("mouseenter", () => { paused = true; stop(); });
    root.addEventListener("mouseleave", () => { paused = false; start(); });
    root.addEventListener("focusin", () => { paused = true; stop(); });
    root.addEventListener("focusout", e => {
      if (!root.contains(e.relatedTarget)) { paused = false; start(); }
    });
    root.querySelector(".poa-offers__modal-close")?.addEventListener("click", () => {
      root.querySelector(".poa-offers__modal").hidden = true;
      if (!paused) start();
    });
    root.querySelector(".poa-offers__modal")?.addEventListener("click", e => {
      if (e.target.classList.contains("poa-offers__modal")) {
        e.currentTarget.hidden = true;
        if (!paused) start();
      }
    });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function start() {
    stop();
    if (offers.length < 2 || paused || document.hidden) return;
    timer = setInterval(() => {
      if (document.hidden || paused) return;
      current = (current + 1) % offers.length;
      render();
    }, ROTATE_MS);
  }

  async function loadOffers() {
    const client = getClient();
    if (!client || typeof client.from !== "function") {
      console.warn("[POACustomers offers] Supabase client not found; slideshow not loaded.");
      return;
    }
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const { data, error } = await client.from("offers")
      .select("id,title,product_name,description,production_date,expiry_date,image_url,status")
      .eq("status", "active")
      .lte("production_date", localDate)
      .gte("expiry_date", localDate)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[POACustomers offers] Could not load offers:", error.message);
      return;
    }
    offers = Array.isArray(data) ? data : [];
    current = 0;
    render();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  function init() {
    addStyles();
    findMount();
    loadOffers().catch(error => console.error("[POACustomers offers]", error));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();
