'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const FILES = {
  brand: 'brand.json',
  content: 'content.json',
  products: 'products.json',
  reviews: 'reviews.json',
};

let store = {};

function readJson(file) {
  const full = path.join(DATA_DIR, file);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function loadAll() {
  const next = {};
  for (const [key, file] of Object.entries(FILES)) {
    next[key] = readJson(file);
  }
  store = next;
  logger.info('content: data files loaded', {
    products: store.products.length,
    reviews: store.reviews.length,
  });
  return store;
}

// Initial load (throw loudly if the data is broken).
loadAll();

// Hot-reload data files while developing so content edits show up
// without a restart. Cheap and best-effort.
if ((process.env.NODE_ENV || 'development') !== 'production') {
  try {
    var watched = new Set(Object.values(FILES));
    fs.watch(DATA_DIR, { persistent: false }, (_evt, filename) => {
      if (!filename || !watched.has(filename)) return; // ignore runtime files
      try {
        loadAll();
      } catch (err) {
        logger.error('content: reload failed, keeping previous data', err.message);
      }
    });
  } catch (err) {
    logger.warn('content: fs.watch unavailable', err.message);
  }
}

/* ─────────────────────────── helpers ─────────────────────────── */

function digitsOnly(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

/** Build a wa.me deep link with a pre-filled message. */
function waLink(message) {
  const number = digitsOnly(store.brand.phoneRaw);
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${number}${text}`;
}

function productsByCategory(categoryId) {
  if (!categoryId || categoryId === 'all') return store.products.slice();
  return store.products.filter((p) => p.category === categoryId);
}

function findProduct(sku) {
  const needle = String(sku || '').trim().toLowerCase();
  return store.products.find(
    (p) => p.sku.toLowerCase() === needle || p.id.toLowerCase() === needle
  );
}

/** Average rating derived from the reviews data. */
function reviewSummary() {
  const list = store.reviews;
  if (!list.length) return { average: '0.0', count: 0 };
  const sum = list.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  return { average: (sum / list.length).toFixed(1), count: list.length };
}

/**
 * Everything the home page template needs, in one object.
 * Keeping this here means routes/templates never touch the raw files.
 */
function homeViewModel() {
  const c = store.content;
  return {
    brand: store.brand,
    nav: c.nav,
    hero: c.hero,
    marquee: c.marquee,
    usps: c.usps,
    catalogue: {
      ...c.catalogue,
      products: store.products,
    },
    bespoke: c.bespoke,
    heritage: c.heritage,
    wholesale: c.wholesale,
    reviews: {
      ...c.reviews,
      items: store.reviews,
    },
    showroom: c.showroom,
    footer: c.footer,
    whatsappQuick: c.whatsappQuick,
    year: new Date().getFullYear(),
    waLink,
  };
}

module.exports = {
  loadAll,
  get brand() {
    return store.brand;
  },
  get content() {
    return store.content;
  },
  get products() {
    return store.products;
  },
  get reviews() {
    return store.reviews;
  },
  waLink,
  productsByCategory,
  findProduct,
  reviewSummary,
  homeViewModel,
};
