'use strict';

const prisma = require('../db/prisma');
const config = require('../config');
const content = require('./content');
const mediaService = require('./mediaService');
const siteSettings = require('./siteSettingsService');
const logger = require('../utils/logger');

/**
 * The website catalogue. Products live in the database once imported from
 * data/products.json (the first time the admin opens the Catalogue page);
 * until then — or without a database — the JSON file is used directly.
 */

const IMPORT_KEY = 'catalogue';
const CACHE_MS = 60 * 1000;
const PRODUCT_PHOTO_SIZE = 1200;
let websiteCache = { data: null, expires: 0 };

function categories() {
  return content.content.catalogue.categories.filter((c) => c.id !== 'all');
}

/** The shape templates, /api/products and the quick-view script expect. */
function toView(p) {
  return {
    id: p.id,
    sku: p.sku,
    category: p.category,
    name: p.name,
    specs: p.specs,
    craft: p.craft,
    description: p.description,
    image: p.mediaAssetId ? `/media/${p.mediaAssetId}` : p.imageUrl || '',
  };
}

async function isImported() {
  const s = await siteSettings.get(IMPORT_KEY, { imported: false });
  return Boolean(s.imported);
}

/** One-time copy of data/products.json into the database. */
async function ensureImported(actorId) {
  if (await isImported()) return;

  const existing = await prisma.product.count();
  if (!existing) {
    await prisma.product.createMany({
      data: content.products.map((p, i) => ({
        id: p.id,
        sku: p.sku,
        category: p.category,
        name: p.name,
        specs: p.specs || '',
        craft: p.craft || '',
        description: p.description || '',
        imageUrl: p.image || null,
        displayOrder: (i + 1) * 10,
      })),
      skipDuplicates: true,
    });
    logger.info('catalog: imported products from data/products.json', { count: content.products.length });
  }
  await siteSettings.set(IMPORT_KEY, { imported: true }, actorId);
  clearCache();
}

async function listForWebsite() {
  if (!config.hasDatabase) return content.products;
  if (websiteCache.data && Date.now() < websiteCache.expires) return websiteCache.data;

  try {
    let data = content.products;
    if (await isImported()) {
      const rows = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      });
      data = rows.map(toView);
    }
    websiteCache = { data, expires: Date.now() + CACHE_MS };
    return data;
  } catch (err) {
    logger.error('catalog: failed to load products, using data/products.json', err.message);
    return content.products;
  }
}

async function findForWebsite(sku) {
  const needle = String(sku || '').trim().toLowerCase();
  const all = await listForWebsite();
  return all.find((p) => p.sku.toLowerCase() === needle || p.id.toLowerCase() === needle) || null;
}

async function listForAdmin() {
  return prisma.product.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] });
}

async function getProduct(id) {
  return prisma.product.findUnique({ where: { id } });
}

function cleanInput(input) {
  const str = (v, max) => String(v || '').trim().slice(0, max);
  const data = {
    sku: str(input.sku, 40).toUpperCase(),
    name: str(input.name, 150),
    category: str(input.category, 40),
    specs: str(input.specs, 300),
    craft: str(input.craft, 300),
    description: str(input.description, 2000),
    displayOrder: parseInt(input.displayOrder, 10) || 0,
    isActive: input.isActive === 'on' || input.isActive === 'true' || input.isActive === true,
  };
  if (!data.sku) throw new Error('Product code (SKU) is required.');
  if (!data.name) throw new Error('Product name is required.');
  if (!categories().some((c) => c.id === data.category)) throw new Error('Choose a category.');
  return data;
}

async function assertSkuFree(sku, exceptId) {
  const clash = await prisma.product.findUnique({ where: { sku } });
  if (clash && clash.id !== exceptId) throw new Error(`Another product already uses the code ${sku}.`);
}

async function createProduct(input, photo, actorId) {
  const data = cleanInput(input);
  if (!photo) throw new Error('Please add a photo for the product.');
  await assertSkuFree(data.sku);

  const asset = await mediaService.uploadWebsiteImage({
    ...photo,
    name: data.name,
    maxSize: PRODUCT_PHOTO_SIZE,
    uploadedById: actorId,
  });
  const product = await prisma.product.create({ data: { ...data, mediaAssetId: asset.id } });
  clearCache();
  return product;
}

async function updateProduct(id, input, photo, actorId) {
  const existing = await getProduct(id);
  if (!existing) throw new Error('Product not found.');
  const data = cleanInput(input);
  await assertSkuFree(data.sku, id);

  if (photo) {
    const asset = await mediaService.uploadWebsiteImage({
      ...photo,
      name: data.name,
      maxSize: PRODUCT_PHOTO_SIZE,
      uploadedById: actorId,
    });
    data.mediaAssetId = asset.id;
  }
  const product = await prisma.product.update({ where: { id }, data });
  if (photo && existing.mediaAssetId) await removeAssetQuietly(existing.mediaAssetId);
  clearCache();
  return product;
}

async function setActive(id, isActive) {
  await prisma.product.update({ where: { id }, data: { isActive } });
  clearCache();
}

async function deleteProduct(id) {
  const existing = await getProduct(id);
  if (!existing) return;
  await prisma.product.delete({ where: { id } });
  if (existing.mediaAssetId) await removeAssetQuietly(existing.mediaAssetId);
  clearCache();
}

/** Deletes a replaced/removed photo unless something else still uses it. */
async function removeAssetQuietly(assetId) {
  try {
    await mediaService.deleteMedia(assetId);
  } catch (err) {
    if (err.code !== 'MEDIA_IN_USE') logger.warn('catalog: could not delete old photo', err.message);
  }
}

function clearCache() {
  websiteCache = { data: null, expires: 0 };
}

module.exports = {
  categories,
  toView,
  ensureImported,
  listForWebsite,
  findForWebsite,
  listForAdmin,
  getProduct,
  createProduct,
  updateProduct,
  setActive,
  deleteProduct,
};
