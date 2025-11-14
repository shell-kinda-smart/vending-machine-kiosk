const AdminApp = (() => {
  let pin = sessionStorage.getItem('adminPass') || '';
  let products = [];
  let activeInput = null;

  const alphaLayout = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'SPACE', 'BACK']
  ];

  const numericLayout = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'BACK']
  ];

  function init() {
    bindUI();
    if (pin) {
      verifyPin(pin)
        .then(() => {
          hidePinOverlay();
          loadProducts();
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

    document.getElementById('addProductBtn').addEventListener('click', addProductRow);
    document.getElementById('saveProductsBtn').addEventListener('click', saveProducts);
    document.getElementById('updatePinBtn').addEventListener('click', updatePin);

    document.getElementById('adminPassKeypad').addEventListener('click', handleOverlayKey);
    document.getElementById('adminPassSubmit').addEventListener('click', submitOverlayPin);

    document.getElementById('oskClose').addEventListener('click', () => toggleKeyboard(false));
  }

  function verifyPin(inputPin) {
    return fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: inputPin })
    }).then((res) => {
      if (!res.ok) throw new Error('Invalid PIN');
      return res.json();
    });
  }

  function showPinOverlay() {
    document.getElementById('adminPassDisplay').textContent = '••••••';
    document.getElementById('adminPassError').textContent = '';
    document.getElementById('adminPassOverlay').classList.remove('hidden');
  }

  function hidePinOverlay() {
    document.getElementById('adminPassOverlay').classList.add('hidden');
  }

  let pinBuffer = '';
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
    const masked = pinBuffer.padEnd(6, '•');
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
        loadProducts();
      })
      .catch(() => {
        document.getElementById('adminPassError').textContent = 'Incorrect PIN';
        pinBuffer = '';
        updateOverlayDisplay();
      });
  }

  function loadProducts() {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        products = data;
        renderProducts();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  function renderProducts() {
    const editor = document.getElementById('productsEditor');
    editor.innerHTML = '';
    products.forEach((product, index) => {
      const row = document.createElement('div');
      row.className = 'product-row';
      row.dataset.index = index;
      row.innerHTML = `
        <input type="text" value="${product.title}" data-field="title" data-keyboard="alpha" readonly>
        <input type="text" value="${product.category}" data-field="category" data-keyboard="alpha" readonly>
        <input type="text" value="${product.price}" data-field="price" data-keyboard="numeric" readonly>
        <input type="text" value="${product.stock}" data-field="stock" data-keyboard="numeric" readonly>
        <button type="button" data-action="remove">Remove</button>
      `;
      row.addEventListener('click', (event) => {
        if (event.target.dataset.action === 'remove') {
          removeProduct(index);
        }
      });
      row.querySelectorAll('input').forEach((input) => {
        input.addEventListener('focus', () => openKeyboard(input));
      });
      editor.appendChild(row);
    });
  }

  function addProductRow() {
    const newProduct = {
      id: `prod-${Date.now()}`,
      title: 'New Product',
      category: 'Misc',
      price: 0,
      stock: 0,
      tags: []
    };
    products.push(newProduct);
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
        'X-Admin-Pass': pin
      },
      body: JSON.stringify({ products })
    })
      .then((res) => {
        if (!res.ok) throw new Error('Save failed');
        alert('Products updated');
      })
      .catch(() => alert('Unable to save products'));
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
        'X-Admin-Pass': pin
      },
      body: JSON.stringify({ newPass: newPin })
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
    toggleKeyboard(true);
    document.getElementById('oskLabel').textContent = mode === 'numeric' ? 'Numeric Pad' : 'Keyboard';
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
        if (key === 'SPACE' || key === 'BACK') {
          btn.classList.add('action');
        }
        btn.addEventListener('click', () => handleKeyboardKey(btn.dataset));
        keysContainer.appendChild(btn);
      });
    });
    const extra = document.createElement('button');
    extra.textContent = 'Clear';
    extra.classList.add('action');
    extra.dataset.action = 'clear';
    extra.addEventListener('click', () => handleKeyboardKey(extra.dataset));
    keysContainer.appendChild(extra);
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
    const row = input.closest('.product-row');
    if (!row) return;
    const index = Number(row.dataset.index);
    const field = input.dataset.field;
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

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});
