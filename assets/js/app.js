const STATUS_META = {
  live: { label: 'Live', className: 'status-live', banner: '' },
  maintenance: { label: 'Maintenance', className: 'status-maintenance', banner: 'Machine is under maintenance.' },
  out_of_service: { label: 'Out of Service', className: 'status-out_of_service', banner: 'This unit is currently unavailable.' },
};

const state = {
  products: [],
  cart: [],
  config: {
    status: 'live',
    categories: [],
    theme: {
      primary: '#6366f1',
      accent: '#0ea5e9',
      backgroundTop: '#f5f8ff',
      backgroundBottom: '#eef2fb',
    },
  },
  filters: {
    category: 'all',
  },
};

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  loadInitialData();
  initAdminAccess();
  initPassKeypad();
});

function setupListeners() {
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);
}

async function loadInitialData() {
  const grid = document.getElementById('products');
  if (grid) {
    grid.innerHTML = `
      <div class="loader">
        <div class="spinner" aria-hidden="true"></div>
        <span>Loading items...</span>
      </div>`;
  }
  try {
    const [configRes, productsRes] = await Promise.all([fetch('/api/config'), fetch('/api/products')]);
    if (!configRes.ok || !productsRes.ok) {
      throw new Error('Server unavailable');
    }
    state.config = await configRes.json();
    state.products = await productsRes.json();
    applyTheme(state.config.theme);
    buildCategoryFilters(state.config.categories);
    applyStatus(state.config.status);
    renderProducts();
    renderCartPanel();
  } catch (error) {
    console.error('Error loading kiosk data:', error);
    if (grid) {
      grid.innerHTML = `<div class="empty-state">Unable to load inventory.<br>${error.message}</div>`;
    }
  } finally {
    hideSplash();
  }
}

function applyStatus(status) {
  const pill = document.querySelector('.status-pill');
  const banner = document.getElementById('statusBanner');
  const overlay = document.getElementById('statusOverlay');
  const meta = STATUS_META[status] || STATUS_META.live;

  if (pill) {
    pill.textContent = meta.label;
    pill.classList.remove('status-live', 'status-maintenance', 'status-out_of_service');
    pill.classList.add(meta.className);
  }

  if (banner) {
    if (meta.banner) {
      banner.textContent = meta.banner;
      banner.classList.toggle('out-of-service', status === 'out_of_service');
      banner.classList.add('visible');
    } else {
      banner.classList.remove('visible', 'out-of-service');
      banner.textContent = '';
    }
  }

  if (overlay) {
    const title = overlay.querySelector('h1');
    const message = overlay.querySelector('p');
    if (title) title.textContent = meta.label;
    if (message) message.textContent = meta.banner || 'Please check back soon.';
    if (status === 'out_of_service') {
      overlay.classList.add('visible');
    } else {
      overlay.classList.remove('visible');
    }
  }
}

function initAdminAccess() {
  const statusPill = document.querySelector('.status-pill');
  if (!statusPill) return;
  let tapCount = 0;
  let lastTap = 0;

  statusPill.addEventListener('pointerdown', () => {
    const now = Date.now();
    if (now - lastTap > 2000) {
      tapCount = 0;
    }
    tapCount += 1;
    lastTap = now;
    if (tapCount >= 10) {
      tapCount = 0;
      showPassOverlay();
    }
  });
}

function buildCategoryFilters(categories = []) {
  const container = document.getElementById('categoryFilters');
  if (!container) return;

  const list = categories && categories.length ? categories : Array.from(new Set(state.products.map((item) => item.category))).sort();
  if (state.filters.category !== 'all' && !list.includes(state.filters.category)) {
    state.filters.category = 'all';
  }

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createFilterButton('All', 'all'));
  list.forEach((category) => {
    fragment.appendChild(createFilterButton(category, category));
  });
  container.appendChild(fragment);
}

function createFilterButton(label, value) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = `cat-btn${state.filters.category === value ? ' active' : ''}`;
  button.addEventListener('click', () => {
    state.filters.category = value;
    document.querySelectorAll('.cat-btn').forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    renderProducts();
  });
  return button;
}

function getFilteredProducts() {
  return state.products.filter((product) => state.filters.category === 'all' || product.category === state.filters.category);
}

function renderProducts() {
  const container = document.getElementById('products');
  if (!container) return;
  const products = getFilteredProducts();
  if (products.length === 0) {
    container.innerHTML = '<div class="empty-state">No items to display.</div>';
    return;
  }

  const locked = state.config.status !== 'live';
  container.innerHTML = '';
  products.forEach((product) => {
    const currentQty = getCartQuantity(product.id);
    const stockLeft = product.stock - currentQty;
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-meta">
        <p class="product-category">${product.category}</p>
        <h3 class="product-title">${product.title}</h3>
      </div>
      <div class="product-info">
        <div class="info-block">
          <span class="info-label">Price</span>
          <span class="price">${formatCurrency(product.price)}</span>
        </div>
        <div class="info-block">
          <span class="info-label">Stock</span>
          <span class="stock">${stockLeft > 0 ? `${stockLeft} left` : 'Out of stock'}</span>
        </div>
      </div>
      <div class="product-actions">
        <div class="quantity">
          <button ${locked ? 'disabled' : ''} onclick="changeProductQty('${product.id}', -1)">-</button>
          <span>${currentQty}</span>
          <button ${locked || stockLeft <= 0 ? 'disabled' : ''} onclick="changeProductQty('${product.id}', 1)">+</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function getCartQuantity(id) {
  const item = state.cart.find((entry) => entry.id === id);
  return item ? item.quantity : 0;
}

function changeProductQty(id, delta) {
  if (state.config.status !== 'live') return;
  const product = state.products.find((entry) => entry.id === id);
  if (!product) return;

  const existingIndex = state.cart.findIndex((entry) => entry.id === id);
  if (existingIndex >= 0) {
    state.cart[existingIndex].quantity += delta;
    if (state.cart[existingIndex].quantity <= 0) {
      state.cart.splice(existingIndex, 1);
    } else if (state.cart[existingIndex].quantity > product.stock) {
      state.cart[existingIndex].quantity = product.stock;
    }
  } else if (delta > 0) {
    state.cart.push({ ...product, quantity: 1 });
  }

  renderProducts();
  renderCartPanel();
}

function renderCartPanel() {
  const cartList = document.getElementById('cartItems');
  if (!cartList) return;

  const locked = state.config.status !== 'live';
  const cartIsEmpty = state.cart.length === 0;

  cartList.innerHTML = '';
  if (locked) {
    cartList.innerHTML = '<div class="cart-empty">Machine unavailable right now</div>';
  } else if (cartIsEmpty) {
    cartList.innerHTML = '<div class="cart-empty">Cart is empty</div>';
  } else {
    state.cart.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <div class="cart-item-info">
          <strong>${item.title}</strong>
          <span>${formatCurrency(item.price)} x ${item.quantity}</span>
        </div>
        <div class="cart-item-controls">
          <button ${locked ? 'disabled' : ''} onclick="changeProductQty('${item.id}', -1)">-</button>
          <span>${item.quantity}</span>
          <button ${locked ? 'disabled' : ''} onclick="changeProductQty('${item.id}', 1)">+</button>
        </div>
      `;
      cartList.appendChild(row);
    });
  }

  const total = document.getElementById('cartTotal');
  if (total) total.textContent = formatCurrency(calculateCartTotal());

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.disabled = locked || cartIsEmpty;
    checkoutBtn.textContent = locked ? 'Unavailable' : 'Checkout';
  }

  const countElement = document.getElementById('cartCount');
  if (countElement) {
    const itemsCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    countElement.innerText = `${itemsCount} item${itemsCount === 1 ? '' : 's'}`;
  }
}

function calculateCartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function checkout() {
  if (state.config.status !== 'live' || state.cart.length === 0) return;
  alert(`Checkout successful!\nTotal: ${formatCurrency(calculateCartTotal())}`);
  state.cart = [];
  renderProducts();
  renderCartPanel();
}

function formatCurrency(value) {
  return currencyFormatter.format(value || 0);
}

function applyTheme(theme = {}) {
  const root = document.documentElement;
  if (theme.primary) {
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--primary-strong', theme.primary);
  }
  if (theme.accent) root.style.setProperty('--accent', theme.accent);
  if (theme.backgroundTop) root.style.setProperty('--bg-top', theme.backgroundTop);
  if (theme.backgroundBottom) root.style.setProperty('--bg-bottom', theme.backgroundBottom);
}

function hideSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  splash.classList.add('hidden');
  setTimeout(() => splash.remove(), 500);
}

let passValue = '';
let passLocked = false;

function initPassKeypad() {
  const keypad = document.getElementById('passKeypad');
  const cancelBtn = document.getElementById('passCancelBtn');
  const submitBtn = document.getElementById('passSubmitBtn');
  if (!keypad || !cancelBtn || !submitBtn) return;
  keypad.addEventListener('click', (event) => {
    const { key, action } = event.target.dataset;
    if (!key && !action) return;
    if (key) {
      if (passValue.length >= 6) return;
      passValue += key;
    } else if (action === 'back') {
      passValue = passValue.slice(0, -1);
    } else if (action === 'clear') {
      passValue = '';
    }
    updatePassDisplay();
  });
  cancelBtn.addEventListener('click', () => {
    hidePassOverlay();
  });
  submitBtn.addEventListener('click', submitPasscode);
}

function updatePassDisplay() {
  const display = document.getElementById('passDisplay');
  if (display) {
    display.textContent = passValue.padEnd(6, '\u2022');
  }
}

function showPassOverlay() {
  const overlay = document.getElementById('passOverlay');
  if (!overlay || passLocked) return;
  passValue = '';
  updatePassDisplay();
  setPassError('');
  overlay.classList.add('visible');
}

function hidePassOverlay() {
  const overlay = document.getElementById('passOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  passValue = '';
  updatePassDisplay();
  setPassError('');
  passLocked = false;
}

function setPassError(message) {
  const errorEl = document.getElementById('passError');
  if (errorEl) {
    errorEl.textContent = message || '';
  }
}

async function submitPasscode() {
  if (!passValue) return;
  passLocked = true;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: passValue })
    });
    if (!res.ok) {
      throw new Error('Invalid PIN');
    }
    sessionStorage.setItem('adminPass', passValue);
    window.location.href = '/admin.html';
  } catch (error) {
    setPassError('Incorrect PIN');
    passValue = '';
    updatePassDisplay();
    passLocked = false;
  }
}

window.changeProductQty = changeProductQty;
