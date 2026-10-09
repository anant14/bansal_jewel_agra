'use strict';

const https = require('https');
const siteSettings = require('./siteSettingsService');
const logger = require('../utils/logger');

/**
 * Live gold rates for India, derived from the international spot price.
 *
 * MCX's own feed is licensed and blocks automated access, so we compute the
 * landed price instead — the same parity MCX gold trades around:
 *
 *   24K (999) per 10g = spot INR/oz ÷ 31.1035 × 10 × 0.999 × (1 + import duty)
 *                       + the admin's premium
 *   22K = 24K × 916/999,  18K = 24K × 750/999
 *
 * Rates exclude 3% GST. Everything tunable lives in the "gold_rates" site
 * setting and is edited from /admin/rates.
 */

const SETTINGS_KEY = 'gold_rates';
const DEFAULT_SETTINGS = {
  mode: 'live', // live | manual — manual uses the rates typed in on /admin/rates
  importDutyPct: 15, // India's effective customs duty on gold since 13 May 2026 (10% BCD + 5% cess)
  premiumPer10g: 0, // added to the 24K rate; 22K/18K follow proportionally
};

const SPOT_URL = 'https://api.gold-api.com/price/XAU/INR';
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const SPOT_TTL_MS = 2 * 60 * 1000;
// If the price API is down, keep showing the last price for a while rather
// than nothing — but never a price this old.
const SPOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const GOLD_PURITIES = [
  { code: 'GOLD_24K', label: '24K', name: '24K Gold', fineness: 0.999 },
  { code: 'GOLD_22K', label: '22K', name: '22K Gold', fineness: 0.916 },
  { code: 'GOLD_18K', label: '18K', name: '18K Gold', fineness: 0.75 },
];

let spotCache = { data: null, fetchedAt: 0, checkedAt: 0 };

function requestSpot() {
  return new Promise((resolve, reject) => {
    const req = https.get(SPOT_URL, { headers: { Accept: 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          const payload = JSON.parse(raw);
          const pricePerOz = Number(payload.price);
          if (res.statusCode !== 200 || !Number.isFinite(pricePerOz) || pricePerOz <= 0) {
            reject(new Error(`unexpected response (HTTP ${res.statusCode})`));
            return;
          }
          resolve({
            pricePerOzInr: pricePerOz,
            usdInr: Number(payload.exchangeRate) || null,
            marketUpdatedAt: payload.updatedAt ? new Date(payload.updatedAt) : new Date(),
          });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('request timed out')));
  });
}

/** The latest spot price, cached; null when unavailable. */
async function getSpot() {
  const now = Date.now();
  if (now - spotCache.checkedAt < SPOT_TTL_MS) return freshSpot(now);

  spotCache.checkedAt = now;
  try {
    spotCache.data = await requestSpot();
    spotCache.fetchedAt = now;
  } catch (err) {
    logger.warn('liveRates: spot price fetch failed', err.message);
  }
  return freshSpot(now);
}

function freshSpot(now) {
  if (!spotCache.data || now - spotCache.fetchedAt > SPOT_MAX_AGE_MS) return null;
  return spotCache.data;
}

function computeRates(spot, settings) {
  const duty = 1 + (Number(settings.importDutyPct) || 0) / 100;
  const premium = Number(settings.premiumPer10g) || 0;
  const fine24k = (spot.pricePerOzInr / GRAMS_PER_TROY_OUNCE) * 10 * 0.999 * duty + premium;

  return GOLD_PURITIES.map((p) => ({
    code: p.code,
    label: p.label,
    name: p.name,
    value: Math.round((fine24k * p.fineness) / 0.999),
  }));
}

async function getSettings() {
  return siteSettings.get(SETTINGS_KEY, DEFAULT_SETTINGS);
}

async function saveSettings({ mode, importDutyPct, premiumPer10g }, actorId) {
  const duty = Number(importDutyPct);
  const premium = Number(premiumPer10g);
  if (!['live', 'manual'].includes(mode)) throw new Error('Choose either live or manual rates.');
  if (!Number.isFinite(duty) || duty < 0 || duty > 50) throw new Error('Import duty must be between 0 and 50%.');
  if (!Number.isFinite(premium) || Math.abs(premium) > 100000) throw new Error('Premium must be a number of rupees.');
  await siteSettings.set(SETTINGS_KEY, { mode, importDutyPct: duty, premiumPer10g: premium }, actorId);
}

/**
 * Live 24K/22K/18K rates per 10g, or null if the price feed is unavailable.
 * Computed regardless of mode; callers decide whether to use them.
 */
async function getLiveGoldRates(settings) {
  const s = settings || (await getSettings());
  const spot = await getSpot();
  if (!spot) return null;
  return { rates: computeRates(spot, s), spot, updatedAt: spot.marketUpdatedAt, settings: s };
}

module.exports = {
  GOLD_PURITIES,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  getLiveGoldRates,
};
