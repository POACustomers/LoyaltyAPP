(function () {
  'use strict';

  const categoriesView = document.getElementById('menuCategoriesView');
  const itemsView = document.getElementById('menuItemsView');
  const config = window.POA_CONFIG || {};
  const supabaseUrl = String(config.SUPABASE_URL || '').trim();
  const publishableKey = String(config.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  let client = null;
  let categories = [];
  let itemsByCategory = new Map();

  function isActive(row) {
    if (!row) return false;
    if (row.is_active === false) return false;
    if (String(row.status || 'active').trim().toLowerCase() === 'inactive') return false;
    return true;
  }

  function formatPrice(value) {
    const amount = Number(value);
    if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(amount)) return '';
    if (window.POA_FORMAT_CURRENCY) return window.POA_FORMAT_CURRENCY(amount);
    return 'EGP ' + amount.toFixed(2);
  }

  function categoryImage(category) {
    if (category.image_url) {
      return '<img class="menu-category-image" src="' + escapeHtml(category.image_url) + '" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">' +
        '<div class="menu-icon" aria-hidden="true" hidden>' + escapeHtml(category.icon || '☕') + '</div>';
    }
    return '<div class="menu-icon" aria-hidden="true">' + escapeHtml(category.icon || '☕') + '</div>';
  }

  function renderCategories() {
    itemsView.hidden = true;
    categoriesView.hidden = false;
    if (!categories.length) {
      categoriesView.innerHTML = '<div class="menu-empty">The menu is being prepared. Please check again later.</div>';
      return;
    }
    categoriesView.innerHTML = '<div class="menu-grid">' + categories.map(category =>
      '<button class="menu-category" type="button" data-category-id="' + escapeHtml(category.id) + '">' +
        '<div class="menu-category-media">' + categoryImage(category) + '</div>' +
        '<span class="menu-name">' + escapeHtml(category.name) + '</span>' +
      '</button>'
    ).join('') + '</div>';
    categoriesView.querySelectorAll('[data-category-id]').forEach(button => {
      button.addEventListener('click', () => openCategory(button.dataset.categoryId));
    });
  }

  function renderItems(category, rows) {
    const visibleRows = rows.filter(isActive);
    const markup = visibleRows.length ? visibleRows.map(item => {
      const image = item.image_url
        ? '<img class="menu-item-image" src="' + escapeHtml(item.image_url) + '" alt="' + escapeHtml(item.name || 'Menu item') + '" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="menu-placeholder" aria-hidden="true" hidden>☕</div>'
        : '<div class="menu-placeholder" aria-hidden="true">☕</div>';
      const description = item.description
        ? '<small class="menu-item-description">' + escapeHtml(item.description) + '</small>' : '';
      const price = formatPrice(item.price);
      return '<article class="menu-item">' + image +
        '<div class="menu-item-copy"><strong class="menu-item-name">' + escapeHtml(item.name || 'Menu item') + '</strong>' +
        description + (price ? '<span class="menu-item-price">' + escapeHtml(price) + '</span>' : '') +
        '</div></article>';
    }).join('') : '<div class="menu-empty">No available items in this category.</div>';

    itemsView.innerHTML =
      '<div class="menu-head menu-head--no-icon"><button class="public-menu-back" type="button" aria-label="Back to categories">‹ <span>Categories</span></button>' +
      '<div class="menu-head-copy"><h2>' + escapeHtml(category.name) + '</h2><p>' + visibleRows.length + ' item' + (visibleRows.length === 1 ? '' : 's') + '</p></div></div>' +
      '<div class="menu-list">' + markup + '</div>';
    itemsView.querySelector('.public-menu-back').addEventListener('click', renderCategories);
    categoriesView.hidden = true;
    itemsView.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function openCategory(categoryId) {
    const category = categories.find(row => String(row.id) === String(categoryId));
    if (!category) return;
    categoriesView.hidden = true;
    itemsView.hidden = false;
    itemsView.innerHTML = '<div class="menu-loading">Loading items…</div>';
    try {
      if (!itemsByCategory.has(String(category.id))) {
        const { data, error } = await client.from('menu_items')
          .select('id,name,description,price,image_url,status,is_active,category_id,created_at')
          .eq('category_id', category.id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        itemsByCategory.set(String(category.id), Array.isArray(data) ? data : []);
      }
      renderItems(category, itemsByCategory.get(String(category.id)) || []);
    } catch (error) {
      console.error('Public menu items query failed:', error);
      itemsView.innerHTML = '<div class="menu-error">This category is temporarily unavailable. Please try again later.</div>' +
        '<button class="public-menu-back" type="button">‹ <span>Categories</span></button>';
      itemsView.querySelector('button').addEventListener('click', renderCategories);
    }
  }

  async function init() {
    if (!window.supabase || !supabaseUrl || !publishableKey) {
      throw new Error('Missing Supabase client configuration.');
    }
    // This page creates an anonymous, read-only client. It does not load or require a customer session.
    client = window.supabase.createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data, error } = await client.from('menu_categories')
      .select('id,name,icon,image_url,sort_order,is_active,status')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    categories = (Array.isArray(data) ? data : [])
      .filter(row => row && String(row.name || '').trim() && isActive(row))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
    renderCategories();
  }

  init().catch(error => {
    console.error('Public menu could not be loaded:', error);
    categoriesView.innerHTML = '<div class="menu-error"><strong>The menu is temporarily unavailable.</strong><br>Please try again later or contact Dina’s Corner.</div>';
    itemsView.hidden = true;
  });
})();
