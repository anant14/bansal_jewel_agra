'use strict';

const prisma = require('../db/prisma');
const config = require('../config');
const mediaService = require('./mediaService');
const logger = require('../utils/logger');

/**
 * Admin-managed homepage photos. Each placement falls back to the defaults
 * in data/content.json while it has no active photos, so the site never
 * shows an empty slideshow or gallery.
 */

const PLACEMENTS = {
  hero: { label: 'Homepage Slideshow', maxSize: 1920 },
  showroom: { label: 'Showroom Gallery', maxSize: 1600 },
};

const CACHE_MS = 60 * 1000;
let cache = { data: null, expires: 0 };

async function activeByPlacement() {
  if (cache.data && Date.now() < cache.expires) return cache.data;

  const rows = await prisma.sitePhoto.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const data = { hero: [], showroom: [] };
  rows.forEach((r) => {
    if (data[r.placement]) data[r.placement].push(r);
  });
  cache = { data, expires: Date.now() + CACHE_MS };
  return data;
}

/** Hero slides in the content.json shape, or null to keep the defaults. */
async function heroSlides() {
  const rows = await safeActive('hero');
  if (!rows || !rows.length) return null;
  return rows.map((r) => ({
    image: `/media/${r.mediaAssetId}`,
    title: r.title,
    label: r.label || '',
    tagline: r.tagline || '',
  }));
}

/** Showroom photos in the content.json shape, or null to keep the defaults. */
async function showroomPhotos() {
  const rows = await safeActive('showroom');
  if (!rows || !rows.length) return null;
  return rows.map((r) => ({ src: `/media/${r.mediaAssetId}`, alt: r.title, wide: r.wide }));
}

async function safeActive(placement) {
  if (!config.hasDatabase) return null;
  try {
    return (await activeByPlacement())[placement];
  } catch (err) {
    logger.error('sitePhotos: failed to load photos, using defaults', err.message);
    return null;
  }
}

async function listForAdmin() {
  const rows = await prisma.sitePhoto.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const grouped = {};
  Object.keys(PLACEMENTS).forEach((key) => {
    grouped[key] = rows.filter((r) => r.placement === key);
  });
  return grouped;
}

function cleanInput(input) {
  const str = (v, max) => String(v || '').trim().slice(0, max);
  const data = {
    title: str(input.title, 150),
    label: str(input.label, 40) || null,
    tagline: str(input.tagline, 150) || null,
    wide: input.wide === 'on' || input.wide === 'true' || input.wide === true,
    displayOrder: parseInt(input.displayOrder, 10) || 0,
    isActive: input.isActive === 'on' || input.isActive === 'true' || input.isActive === true,
  };
  if (!data.title) throw new Error('Please add a short description of the photo.');
  return data;
}

async function addPhoto(placement, input, photo, actorId) {
  const spec = PLACEMENTS[placement];
  if (!spec) throw new Error('Unknown photo placement.');
  if (!photo) throw new Error('Please choose a photo to upload.');
  const data = cleanInput({ ...input, isActive: true });

  const asset = await mediaService.uploadWebsiteImage({
    ...photo,
    name: data.title,
    maxSize: spec.maxSize,
    uploadedById: actorId,
  });
  const row = await prisma.sitePhoto.create({ data: { ...data, placement, mediaAssetId: asset.id } });
  clearCache();
  return row;
}

async function updatePhoto(id, input) {
  const row = await prisma.sitePhoto.update({ where: { id }, data: cleanInput(input) });
  clearCache();
  return row;
}

async function deletePhoto(id) {
  const row = await prisma.sitePhoto.findUnique({ where: { id } });
  if (!row) return;
  await prisma.sitePhoto.delete({ where: { id } });
  try {
    await mediaService.deleteMedia(row.mediaAssetId);
  } catch (err) {
    if (err.code !== 'MEDIA_IN_USE') logger.warn('sitePhotos: could not delete photo file', err.message);
  }
  clearCache();
}

/** True when this media asset is shown on the public website. */
async function isPublicAsset(mediaAssetId) {
  const [photos, products] = await Promise.all([
    prisma.sitePhoto.count({ where: { mediaAssetId } }),
    prisma.product.count({ where: { mediaAssetId } }),
  ]);
  return photos + products > 0;
}

function clearCache() {
  cache = { data: null, expires: 0 };
}

module.exports = {
  PLACEMENTS,
  heroSlides,
  showroomPhotos,
  listForAdmin,
  addPhoto,
  updatePhoto,
  deletePhoto,
  isPublicAsset,
};
