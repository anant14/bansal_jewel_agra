'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
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

function normalizeGoogleReview(review) {
  if (!review || !review.author_name) return null;
  return {
    author: review.author_name,
    location: 'Google Business Profile',
    rating: Math.min(5, Math.max(1, Math.round(Number(review.rating) || 5))),
    source: 'Verified Google review',
    comment: review.text || 'Verified customer review from Google.',
    date: review.relative_time_description || 'Google review',
  };
}

function fetchGoogleReviews() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) return null;

  const endpoint = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,reviews&key=${encodeURIComponent(apiKey)}`;

  return new Promise((resolve) => {
    const req = https.get(endpoint, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          const payload = JSON.parse(raw);
          if (!payload || payload.status !== 'OK' || !payload.result) {
            resolve(null);
            return;
          }
          const result = payload.result;
          const reviews = Array.isArray(result.reviews) ? result.reviews.map(normalizeGoogleReview).filter(Boolean) : [];
          const summary = {
            average: Number(result.rating || 0).toFixed(1),
            count: Number(result.user_ratings_total || reviews.length || 0),
          };
          resolve({ summary, items: reviews });
        } catch (err) {
          logger.warn('content: Google reviews fetch failed', err.message);
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function getReviewsData() {
  const live = await fetchGoogleReviews();
  if (live && live.summary && Number(live.summary.average) > 0) {
    return {
      summary: live.summary,
      items: live.items && live.items.length ? live.items : store.reviews,
    };
  }

  const configured = store.content.reviews || {};
  const local = reviewSummary();
  const fallback = {
    average: Number(configured.ratingValue || local.average).toFixed(1),
    count: Number(String(configured.ratingCount || '').match(/\d[\d,]*/)?.[0]?.replace(/,/g, '') || local.count),
  };
  return {
    summary: fallback,
    items: store.reviews,
  };
}

/**
 * Everything the home page template needs, in one object.
 * Keeping this here means routes/templates never touch the raw files.
 */
async function homeViewModel() {
  const c = store.content;
  const live = await getReviewsData();
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
      ratingValue: live.summary.average,
      ratingCount: `${live.summary.count} Verified Reviews`,
      items: live.items,
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
  fetchGoogleReviews,
  getReviewsData,
  homeViewModel,
};
