'use strict';

const prisma = require('../db/prisma');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Website settings that the admin can change without a deploy, stored as
 * JSON in site_settings. Reads are cached briefly because some of them are
 * needed on every page view.
 */

const CACHE_MS = 60 * 1000;
const cache = new Map(); // key -> { value, expires }

async function get(key, defaults = {}) {
  if (!config.hasDatabase) return { ...defaults };

  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return { ...defaults, ...hit.value };

  try {
    const row = await prisma.siteSetting.findUnique({ where: { key } });
    const value = row && row.value && typeof row.value === 'object' ? row.value : {};
    cache.set(key, { value, expires: Date.now() + CACHE_MS });
    return { ...defaults, ...value };
  } catch (err) {
    logger.error(`siteSettings: failed to read "${key}"`, err.message);
    return { ...defaults };
  }
}

async function set(key, value, actorId) {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value, updatedById: actorId || null },
    create: { key, value, updatedById: actorId || null },
  });
  cache.delete(key);
}

module.exports = { get, set };
