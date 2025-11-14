const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'assets', 'data', 'products.json');
const ENV_PATH = path.join(__dirname, '.env');

let adminPass = process.env.ADMIN_PASS || '000111';

app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/products', (req, res) => {
  fs.readFile(DATA_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error('Unable to read products.json', err);
      return res.status(500).json({ error: 'Failed to read products file' });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      res.status(500).json({ error: 'Invalid products file' });
    }
  });
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

app.post('/api/products', requireAdmin, (req, res) => {
  const { products } = req.body || {};
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  fs.writeFile(DATA_PATH, JSON.stringify(products, null, 2), (err) => {
    if (err) {
      console.error('Failed to save products', err);
      return res.status(500).json({ error: 'Failed to save products' });
    }
    res.json({ success: true });
  });
});

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
