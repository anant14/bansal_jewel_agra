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

// Place Details (New) returns at most 5 reviews; Google bills per call, so
// cache the result instead of hitting the API on every page view.
const GOOGLE_REVIEWS_TTL_MS = 6 * 60 * 60 * 1000;
const GOOGLE_REVIEWS_RETRY_MS = 10 * 60 * 1000;
let googleCache = { data: null, expires: 0 };
// Last outcome, surfaced on /healthz so a misconfigured key is visible without log access.
let googleStatus = 'not_checked';

function normalizeGoogleReview(review) {
  const author = review && review.authorAttribution && review.authorAttribution.displayName;
  const text = review && ((review.text && review.text.text) || (review.originalText && review.originalText.text));
  if (!author || !text) return null;
  return {
    author,
    location: 'Google review',
    rating: Math.min(5, Math.max(1, Math.round(Number(review.rating) || 5))),
    source: 'Verified Google review',
    comment: text,
    date: review.relativePublishTimeDescription || 'Google review',
  };
}

function requestGoogleReviews(apiKey, placeId) {
  const options = {
    hostname: 'places.googleapis.com',
    path: `/v1/places/${encodeURIComponent(placeId)}`,
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
    },
  };

  return new Promise((resolve) => {
    const req = https.get(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          const payload = JSON.parse(raw);
          if (res.statusCode !== 200 || !payload) {
            const msg = payload && payload.error ? payload.error.message : `HTTP ${res.statusCode}`;
            logger.warn('content: Google reviews request failed', msg);
            googleStatus = `error: ${msg}`;
            resolve(null);
            return;
          }
          const reviews = Array.isArray(payload.reviews) ? payload.reviews.map(normalizeGoogleReview).filter(Boolean) : [];
          const summary = {
            average: Number(payload.rating || 0).toFixed(1),
            count: Number(payload.userRatingCount || reviews.length || 0),
          };
          googleStatus = 'ok';
          resolve({ summary, items: reviews });
        } catch (err) {
          logger.warn('content: Google reviews fetch failed', err.message);
          googleStatus = `error: ${err.message}`;
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      logger.warn('content: Google reviews fetch failed', err.message);
      googleStatus = `error: ${err.message}`;
      resolve(null);
    });
    req.setTimeout(10000, () => {
      googleStatus = 'error: request timed out';
      req.destroy();
      resolve(null);
    });
  });
}

async function fetchGoogleReviews() {
  // Trimmed: values pasted into the Render dashboard can carry a trailing newline.
  const apiKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();
  const placeId = (process.env.GOOGLE_PLACE_ID || '').trim();
  if (!apiKey || !placeId) {
    googleStatus = `not_configured: missing ${[!apiKey && 'GOOGLE_PLACES_API_KEY', !placeId && 'GOOGLE_PLACE_ID'].filter(Boolean).join(' and ')}`;
    return null;
  }

  const now = Date.now();
  if (now < googleCache.expires) return googleCache.data;

  const data = await requestGoogleReviews(apiKey, placeId);
  // On failure keep serving the last good result, and retry sooner.
  googleCache = {
    data: data || googleCache.data,
    expires: now + (data ? GOOGLE_REVIEWS_TTL_MS : GOOGLE_REVIEWS_RETRY_MS),
  };
  return googleCache.data;
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
  get googleReviewsStatus() {
    return googleStatus;
  },
  homeViewModel,
};
