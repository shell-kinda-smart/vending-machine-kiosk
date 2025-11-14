const state = {
  products: [],
  cart: [],
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
  fetchProducts();
  initAdminAccess();
  initPassKeypad();
});

function initAdminAccess() {
  const statusPill = document.querySelector('.status-pill');
  if (!statusPill) return;
  let holdTimer = null;

  const startHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      showPassOverlay();
    }, 5000);
  };

  const cancelHold = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  statusPill.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => {
    statusPill.addEventListener(evt, cancelHold);
  });
}

function setupListeners() {
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', checkout);
  }
}

async function fetchProducts() {
  const grid = document.getElementById('products');
  if (grid) {
    grid.innerHTML = `
      <div class="loader">
        <div class="spinner" aria-hidden="true"></div>
        <span>Loading items...</span>
      </div>`;
  }

  try {
    const response = await fetch('/api/products');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    state.products = await response.json();
    buildCategoryFilters();
    renderProducts();
    renderCartPanel();
    hideSplash();
  } catch (error) {
    console.error('Error fetching products:', error);
    if (grid) {
      grid.innerHTML = `<div class="empty-state">Could not load items.<br>${error.message}</div>`;
    }
    hideSplash();
  }
}

function buildCategoryFilters() {
  const container = document.getElementById('categoryFilters');
  if (!container) return;

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createFilterButton('All', 'all'));

  const categories = Array.from(new Set(state.products.map((item) => item.category))).sort();
  categories.forEach((category) => {
    fragment.appendChild(createFilterButton(category, category));
  });

  container.innerHTML = '';
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
  return state.products.filter((product) => {
    return state.filters.category === 'all' || product.category === state.filters.category;
  });
}

function renderProducts() {
  const container = document.getElementById('products');
  if (!container) return;

  const products = getFilteredProducts();
  if (products.length === 0) {
    container.innerHTML = '<div class="empty-state">No items match that search.</div>';
    return;
  }

  container.innerHTML = '';
  products.forEach((product) => {
    const inCart = getCartQuantity(product.id);
    const stockLeft = Math.max(product.stock - inCart, 0);

    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-meta">
        <p class="product-category">${product.category}</p>
        <h3 class="product-title">${product.title}</h3>
      </div>
      <div class="product-info">
        <span class="price">${formatCurrency(product.price)}</span>
        <span class="stock">${stockLeft > 0 ? `${stockLeft} left` : 'Out of stock'}</span>
      </div>
      <div class="product-actions">
        <div class="quantity">
          <button onclick="changeProductQty('${product.id}', -1)" ${inCart <= 0 ? 'disabled' : ''}>-</button>
          <span>${inCart}</span>
          <button onclick="changeProductQty('${product.id}', 1)" ${stockLeft <= 0 ? 'disabled' : ''}>+</button>
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
  const product = state.products.find((entry) => entry.id === id);
  if (!product) return;

  const cartItem = state.cart.find((entry) => entry.id === id);

  if (!cartItem && delta > 0 && product.stock > 0) {
    state.cart.push({ ...product, quantity: 1 });
  } else if (cartItem) {
    const next = cartItem.quantity + delta;
    if (next <= 0) {
      state.cart = state.cart.filter((entry) => entry.id !== id);
    } else if (next <= product.stock) {
      cartItem.quantity = next;
    } else {
      cartItem.quantity = product.stock;
    }
  }

  renderProducts();
  renderCartPanel();
}

function renderCartPanel() {
  const cartList = document.getElementById('cartItems');
  if (!cartList) return;

  if (state.cart.length === 0) {
    cartList.innerHTML = '<div class="cart-empty">Cart is empty</div>';
  } else {
    cartList.innerHTML = '';
    state.cart.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <div class="cart-item-info">
          <strong>${item.title}</strong>
          <span>${formatCurrency(item.price)} x ${item.quantity}</span>
        </div>
        <div class="cart-item-controls">
          <button onclick="changeProductQty('${item.id}', -1)">-</button>
          <span>${item.quantity}</span>
          <button onclick="changeProductQty('${item.id}', 1)" ${item.quantity >= item.stock ? 'disabled' : ''}>+</button>
        </div>
      `;
      cartList.appendChild(row);
    });
  }

  const total = formatCurrency(calculateCartTotal());
  const totalElement = document.getElementById('cartTotal');
  if (totalElement) {
    totalElement.innerText = total;
  }

  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.disabled = state.cart.length === 0;
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
  if (state.cart.length === 0) return;
  alert(`Checkout successful!\nTotal: ${formatCurrency(calculateCartTotal())}`);
  state.cart = [];
  renderProducts();
  renderCartPanel();
}

function formatCurrency(value) {
  return currencyFormatter.format(value || 0);
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
    display.textContent = passValue.padEnd(6, '•');
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
