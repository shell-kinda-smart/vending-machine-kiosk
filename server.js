const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'assets', 'data', 'products.json');
const CONFIG_PATH = path.join(__dirname, 'assets', 'data', 'config.json');
const ENV_PATH = path.join(__dirname, '.env');

let adminPass = process.env.ADMIN_PASS || '000111';
const DEFAULT_CONFIG = {
  status: 'live',
  categories: ['Drinks'],
  theme: {
    primary: '#6366f1',
    accent: '#0ea5e9',
    backgroundTop: '#f5f8ff',
    backgroundBottom: '#eef2fb',
  },
};

app.use(express.json());
app.use(express.static(__dirname));

function readJson(filePath, fallback = []) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return resolve(fallback);
        }
        return reject(err);
      }
      try {
        resolve(JSON.parse(data));
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

function writeJson(filePath, payload) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

app.get('/api/products', async (req, res) => {
  try {
    const data = await readJson(DATA_PATH);
    res.json(data);
  } catch (error) {
    console.error('Unable to read products.json', error);
    res.status(500).json({ error: 'Failed to read products file' });
  }
});

app.get('/api/config', async (req, res) => {
  try {
    const config = await readJson(CONFIG_PATH, DEFAULT_CONFIG);
    res.json(applyConfigDefaults(config));
  } catch (error) {
    console.error('Unable to read config', error);
    res.status(500).json({ error: 'Failed to read config' });
  }
});

app.post('/api/auth', (req, res) => {
  const { pass } = req.body || {};
  if (pass && pass === adminPass) {
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid PIN' });
});

function requireAdmin(req, res, next) {
  const headerPass = req.headers['x-admin-pass'];
  if (!headerPass || headerPass !== adminPass) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/api/products', requireAdmin, async (req, res) => {
  const { products } = req.body || {};
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const sanitized = products.map((item, index) => ({
    id: item.id || `prod-${String(index + 1).padStart(3, '0')}`,
    title: String(item.title || 'Untitled').trim(),
    category: String(item.category || 'Misc').trim(),
    price: Number(item.price) || 0,
    stock: Number(item.stock) || 0
  }));
  try {
    await writeJson(DATA_PATH, sanitized);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save products', error);
    res.status(500).json({ error: 'Failed to save products' });
  }
});

app.post('/api/config', requireAdmin, async (req, res) => {
  const { status, categories, theme } = req.body || {};
  const allowedStatuses = ['live', 'maintenance', 'out_of_service'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: 'Categories required' });
  }
  const trimmedCategories = Array.from(
    new Set(
      categories
        .map((cat) => String(cat || '').trim())
        .filter((cat) => cat.length > 0)
    )
  );
  if (!trimmedCategories.length) {
    return res.status(400).json({ error: 'Categories required' });
  }
  const sanitizedTheme = {
    primary: theme?.primary || DEFAULT_CONFIG.theme.primary,
    accent: theme?.accent || DEFAULT_CONFIG.theme.accent,
    backgroundTop: theme?.backgroundTop || DEFAULT_CONFIG.theme.backgroundTop,
    backgroundBottom: theme?.backgroundBottom || DEFAULT_CONFIG.theme.backgroundBottom,
  };
  const nextConfig = {
    status,
    categories: trimmedCategories,
    theme: sanitizedTheme,
  };
  try {
    await writeJson(CONFIG_PATH, nextConfig);
    res.json({ success: true, config: nextConfig });
  } catch (error) {
    console.error('Failed to save config', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

function applyConfigDefaults(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  merged.categories = Array.from(new Set((config?.categories || DEFAULT_CONFIG.categories).map((cat) => String(cat || '').trim()).filter(Boolean)));
  merged.theme = {
    ...DEFAULT_CONFIG.theme,
    ...(config?.theme || {}),
  };
  if (!merged.categories.length) merged.categories = DEFAULT_CONFIG.categories;
  if (!['live', 'maintenance', 'out_of_service'].includes(merged.status)) {
    merged.status = DEFAULT_CONFIG.status;
  }
  return merged;
}

app.post('/api/password', requireAdmin, (req, res) => {
  const { newPass } = req.body || {};
  if (!newPass || typeof newPass !== 'string' || newPass.length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  }
  adminPass = newPass;
  fs.writeFile(ENV_PATH, `ADMIN_PASS=${newPass}\n`, (err) => {
    if (err) {
      console.error('Failed to update .env', err);
    }
  });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Vending kiosk server running on http://localhost:${PORT}`);
});
