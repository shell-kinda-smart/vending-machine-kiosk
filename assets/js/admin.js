const AdminApp = (() => {
  let pin = sessionStorage.getItem('adminPass') || '';
  let products = [];
  let config = {
    status: 'live',
    categories: [],
    theme: {},
  };
  let activeInput = null;
  let pinBuffer = '';
  const themeInputs = {
    primary: null,
    accent: null,
    backgroundTop: null,
    backgroundBottom: null,
  };

  const alphaLayout = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'SPACE', 'BACK'],
  ];

  const numericLayout = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'BACK'],
  ];

  const STATUSES = [
    { value: 'live', label: 'Live' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'out_of_service', label: 'Out of Service' },
  ];

  function init() {
    bindUI();
    if (pin) {
      verifyPin(pin)
        .then(() => {
          hidePinOverlay();
          loadData();
        })
        .catch(() => showPinOverlay());
    } else {
      showPinOverlay();
    }
  }

  function bindUI() {
    document.getElementById('exitBtn').addEventListener('click', () => {
      sessionStorage.removeItem('adminPass');
      window.location.href = '/';
    });

    themeInputs.primary = document.getElementById('themePrimary');
    themeInputs.accent = document.getElementById('themeAccent');
    themeInputs.backgroundTop = document.getElementById('themeBgTop');
    themeInputs.backgroundBottom = document.getElementById('themeBgBottom');

    document.getElementById('addProductBtn').addEventListener('click', addProductRow);
    document.getElementById('saveProductsBtn').addEventListener('click', saveProducts);
    document.getElementById('addCategoryBtn').addEventListener('click', addCategoryRow);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('updatePinBtn').addEventListener('click', updatePin);
    ['newPinInput', 'confirmPinInput'].forEach((id) => {
      const input = document.getElementById(id);
      input.addEventListener('focus', () => openKeyboard(input));
      input.addEventListener('click', () => openKeyboard(input));
    });

    document.getElementById('adminPassKeypad').addEventListener('click', handleOverlayKey);
    document.getElementById('adminPassSubmit').addEventListener('click', submitOverlayPin);
    document.getElementById('oskClose').addEventListener('click', () => toggleKeyboard(false));

    Object.entries(themeInputs).forEach(([key, el]) => {
      if (!el) return;
      el.addEventListener('input', () => handleThemeInput(key, el.value));
    });
  }

  function verifyPin(inputPin) {
    return fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: inputPin }),
    }).then((res) => {
      if (!res.ok) throw new Error('Invalid PIN');
      return res.json();
    });
  }

  function showPinOverlay() {
    pinBuffer = '';
    updateOverlayDisplay();
    document.getElementById('adminPassError').textContent = '';
    document.getElementById('adminPassOverlay').classList.remove('hidden');
  }

  function hidePinOverlay() {
    document.getElementById('adminPassOverlay').classList.add('hidden');
  }

  function handleOverlayKey(event) {
    const { key, action } = event.target.dataset;
    if (!key && !action) return;
    if (key) {
      if (pinBuffer.length >= 6) return;
      pinBuffer += key;
    } else if (action === 'back') {
      pinBuffer = pinBuffer.slice(0, -1);
    } else if (action === 'clear') {
      pinBuffer = '';
    }
    updateOverlayDisplay();
  }

  function updateOverlayDisplay() {
    const masked = pinBuffer.padEnd(6, '\u2022');
    document.getElementById('adminPassDisplay').textContent = masked;
  }

  function submitOverlayPin() {
    if (pinBuffer.length === 0) return;
    verifyPin(pinBuffer)
      .then(() => {
        pin = pinBuffer;
        sessionStorage.setItem('adminPass', pin);
        pinBuffer = '';
        hidePinOverlay();
        loadData();
      })
      .catch(() => {
        document.getElementById('adminPassError').textContent = 'Incorrect PIN';
        pinBuffer = '';
        updateOverlayDisplay();
      });
  }

  function loadData() {
    Promise.all([fetch('/api/products'), fetch('/api/config')])
      .then(([prodRes, configRes]) => Promise.all([prodRes.json(), configRes.json()]))
      .then(([prodData, configData]) => {
        products = prodData;
        config = {
          status: configData.status || 'live',
          categories: configData.categories || [],
          theme: configData.theme || {},
        };
        renderAll();
      })
      .catch((err) => {
        console.error('Unable to load admin data', err);
        alert('Unable to load data');
      });
  }

  function renderAll() {
    renderProducts();
    renderCategories();
    renderStatusOptions();
    renderThemeControls();
  }

  function renderProducts() {
    const editor = document.getElementById('productsEditor');
    editor.innerHTML = '';
    products.forEach((product, index) => {
      const row = document.createElement('div');
      row.className = 'product-row';
      row.dataset.index = index;
      row.innerHTML = `
        ${renderField('Title', `<input type="text" value="${product.title}" data-field="title" data-keyboard="alpha" readonly>`, index)}
        ${renderField('Category', renderCategorySelect(product.category, index), index)}
        ${renderField('Price', `<input type="text" value="${product.price}" data-field="price" data-keyboard="numeric" readonly>`, index)}
        ${renderField('Stock', `<input type="text" value="${product.stock}" data-field="stock" data-keyboard="numeric" readonly>`, index)}
        <button type="button" data-action="remove">Remove</button>
      `;
      row.addEventListener('click', (event) => {
        if (event.target.dataset.action === 'remove') {
          removeProduct(index);
        }
      });
      row.querySelectorAll('input').forEach((input) => {
        input.addEventListener('focus', () => openKeyboard(input));
        input.addEventListener('click', () => openKeyboard(input));
      });
      const select = row.querySelector('select');
      if (select) {
        select.addEventListener('change', () => {
          products[index].category = select.value;
        });
      }
      editor.appendChild(row);
    });
  }

  function renderCategorySelect(selected, index) {
    const cats = Array.from(new Set([...(config.categories || []), selected].filter(Boolean)));
    const options = cats.map((cat) => `<option value="${cat}" ${cat === selected ? 'selected' : ''}>${cat}</option>`).join('');
    return `
      <select data-field="category" data-index="${index}">
        ${options}
      </select>
    `;
  }

  function addProductRow() {
    const defaultCategory = config.categories[0] || 'General';
    const id = `prod-${Date.now()}`;
    products.push({
      id,
      title: 'New Product',
      category: defaultCategory,
      price: 0,
      stock: 0,
    });
    renderProducts();
  }

  function removeProduct(index) {
    products.splice(index, 1);
    renderProducts();
  }

  function saveProducts() {
    fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pass': pin,
      },
      body: JSON.stringify({ products }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Save failed');
        alert('Products updated');
      })
      .catch(() => alert('Unable to save products'));
  }

  function renderCategories() {
    const container = document.getElementById('categoriesEditor');
    if (!Array.isArray(config.categories)) config.categories = [];
    container.innerHTML = '';
    if (!config.categories || !config.categories.length) {
      const hint = document.createElement('div');
      hint.className = 'setting-hint';
      hint.textContent = 'No categories yet. Add one to begin.';
      container.appendChild(hint);
      return;
    }
    config.categories.forEach((cat, index) => {
      const row = document.createElement('div');
      row.className = 'category-row';
      row.innerHTML = `
        <input type="text" value="${cat}" data-cat-index="${index}" data-keyboard="alpha" readonly>
        <button type="button" data-index="${index}">Remove</button>
      `;
      const input = row.querySelector('input');
      input.addEventListener('focus', () => openKeyboard(input));
      input.addEventListener('click', () => openKeyboard(input));
      row.querySelector('button').addEventListener('click', () => removeCategory(index));
      container.appendChild(row);
    });
  }

  function addCategoryRow() {
    config.categories.push('New Category');
    renderCategories();
    renderProducts();
    setTimeout(() => {
      const inputs = document.querySelectorAll('[data-cat-index]');
      const target = inputs[inputs.length - 1];
      if (target) {
        target.focus();
        openKeyboard(target);
      }
    }, 0);
  }

  function removeCategory(index) {
    config.categories.splice(index, 1);
    if (!config.categories.length) {
      config.categories.push('General');
    }
    renderCategories();
    renderProducts();
  }

  function renderStatusOptions() {
    const wrapper = document.getElementById('statusOptions');
    wrapper.innerHTML = '';
    STATUSES.forEach((status) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = status.label;
      btn.className = `status-btn${config.status === status.value ? ' active' : ''}`;
      btn.addEventListener('click', () => {
        config.status = status.value;
        renderStatusOptions();
      });
      wrapper.appendChild(btn);
    });
  }

  function saveConfig() {
    const message = document.getElementById('configMessage');
    const trimmed = (config.categories || []).map((cat) => cat.trim()).filter((cat) => cat);
    if (!trimmed.length) {
      message.textContent = 'Need at least one category.';
      return;
    }
    const deduped = Array.from(new Set(trimmed));
    fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pass': pin,
      },
      body: JSON.stringify({
        status: config.status,
        categories: deduped,
        theme: config.theme || {},
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        config.categories = deduped;
        message.textContent = 'Configuration saved.';
        renderStatusOptions();
        renderProducts();
        renderThemeControls();
      })
      .catch(() => {
        message.textContent = 'Unable to save config.';
      });
  }

  function updatePin() {
    const newPin = document.getElementById('newPinInput').value;
    const confirmPin = document.getElementById('confirmPinInput').value;
    const message = document.getElementById('pinMessage');
    if (!newPin || newPin.length < 4 || newPin !== confirmPin) {
      message.textContent = 'PINs must match and be at least 4 digits.';
      return;
    }
    fetch('/api/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pass': pin,
      },
      body: JSON.stringify({ newPass: newPin }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        pin = newPin;
        sessionStorage.setItem('adminPass', pin);
        message.textContent = 'PIN updated successfully.';
        document.getElementById('newPinInput').value = '';
        document.getElementById('confirmPinInput').value = '';
      })
      .catch(() => {
        message.textContent = 'Unable to update PIN.';
      });
  }

  function openKeyboard(input) {
    activeInput = input;
    const mode = input.dataset.keyboard || 'alpha';
    renderKeyboard(mode);
    document.getElementById('oskLabel').textContent = mode === 'numeric' ? 'Numeric Pad' : 'Keyboard';
    document.getElementById('osk').classList.add('visible');
  }

  function renderKeyboard(mode) {
    const keysContainer = document.getElementById('oskKeys');
    keysContainer.innerHTML = '';
    const layout = mode === 'numeric' ? numericLayout : alphaLayout;
    layout.forEach((row) => {
      row.forEach((key) => {
        const btn = document.createElement('button');
        if (key === 'SPACE') {
          btn.textContent = 'Space';
          btn.dataset.action = 'space';
        } else if (key === 'BACK') {
          btn.textContent = '⌫';
          btn.dataset.action = 'back';
        } else {
          btn.textContent = key;
          btn.dataset.key = key;
        }
        if (key === 'SPACE' || key === 'BACK') btn.classList.add('action');
        btn.addEventListener('click', () => handleKeyboardKey(btn.dataset));
        keysContainer.appendChild(btn);
      });
    });
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.classList.add('action');
    clearBtn.dataset.action = 'clear';
    clearBtn.addEventListener('click', () => handleKeyboardKey(clearBtn.dataset));
    keysContainer.appendChild(clearBtn);
  }

  function handleKeyboardKey(dataset) {
    if (!activeInput) return;
    let value = activeInput.value;
    if (dataset.key) {
      value += dataset.key === '.' ? '.' : dataset.key;
    } else if (dataset.action === 'space') {
      value += ' ';
    } else if (dataset.action === 'back') {
      value = value.slice(0, -1);
    } else if (dataset.action === 'clear') {
      value = '';
    }
    activeInput.value = value;
    syncInputValue(activeInput);
  }

  function syncInputValue(input) {
    const field = input.dataset.field;
    const catIndex = input.dataset.catIndex;
    if (typeof catIndex !== 'undefined') {
      config.categories[Number(catIndex)] = input.value;
      return;
    }
    const row = input.closest('.product-row');
    if (!row) return;
    const index = Number(row.dataset.index);
    if (field === 'price' || field === 'stock') {
      const numericValue = Number(input.value) || 0;
      products[index][field] = numericValue;
    } else {
      products[index][field] = input.value;
    }
  }

  function toggleKeyboard(visible) {
    const osk = document.getElementById('osk');
    if (visible) {
      osk.classList.add('visible');
    } else {
      osk.classList.remove('visible');
      activeInput = null;
    }
  }

  function renderField(label, control) {
    return `<div class="product-field"><label>${label}</label>${control}</div>`;
  }

  function renderThemeControls() {
    if (!config.theme) config.theme = {};
    config.theme = {
      primary: config.theme.primary || '#6366f1',
      accent: config.theme.accent || '#0ea5e9',
      backgroundTop: config.theme.backgroundTop || '#f5f8ff',
      backgroundBottom: config.theme.backgroundBottom || '#eef2fb',
    };
    if (themeInputs.primary) themeInputs.primary.value = config.theme.primary || '#6366f1';
    if (themeInputs.accent) themeInputs.accent.value = config.theme.accent || '#0ea5e9';
    if (themeInputs.backgroundTop) themeInputs.backgroundTop.value = config.theme.backgroundTop || '#f5f8ff';
    if (themeInputs.backgroundBottom) themeInputs.backgroundBottom.value = config.theme.backgroundBottom || '#eef2fb';
  }

  function handleThemeInput(key, value) {
    if (!config.theme) config.theme = {};
    if (!value) return;
    config.theme[key] = value;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});
