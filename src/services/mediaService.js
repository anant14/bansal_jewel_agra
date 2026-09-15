'use strict';

const path = require('path');
const prisma = require('../db/prisma');
const storage = require('./storage');
const whatsapp = require('./whatsapp');
const timeline = require('./timelineService');
const logger = require('../utils/logger');

// MIME type AND extension are both checked — never trust either alone.
const ALLOWED = {
  'image/jpeg': { mediaType: 'image', extensions: ['.jpg', '.jpeg'], maxBytes: 5 * 1024 * 1024 },
  'image/png': { mediaType: 'image', extensions: ['.png'], maxBytes: 5 * 1024 * 1024 },
  'image/webp': { mediaType: 'image', extensions: ['.webp'], maxBytes: 5 * 1024 * 1024 },
  'video/mp4': { mediaType: 'video', extensions: ['.mp4'], maxBytes: 16 * 1024 * 1024 },
  'application/pdf': { mediaType: 'document', extensions: ['.pdf'], maxBytes: 10 * 1024 * 1024 },
};

const CATEGORIES = [
  'Gold Jewellery', 'Diamond Jewellery', 'Silver Jewellery', 'Bridal Collection',
  'Rings', 'Necklaces', 'Bangles', 'Earrings', 'Festival Creatives', 'Offers',
  'Certificates', 'Store Media', 'Other',
];

function validateUpload({ mimeType, originalFilename, size }) {
  const rule = ALLOWED[mimeType];
  if (!rule) return { ok: false, error: 'That file type is not supported. Allowed: JPEG, PNG, WEBP images, MP4 video, or PDF.' };

  const ext = path.extname(originalFilename || '').toLowerCase();
  if (!rule.extensions.includes(ext)) {
    return { ok: false, error: 'The file extension does not match its content type.' };
  }
  if (size > rule.maxBytes) {
    return { ok: false, error: `File is too large. Maximum for this type is ${Math.round(rule.maxBytes / (1024 * 1024))}MB.` };
  }
  return { ok: true, mediaType: rule.mediaType };
}

async function uploadMedia({ buffer, originalFilename, mimeType, name, category, uploadedById }) {
  const check = validateUpload({ mimeType, originalFilename, size: buffer.length });
  if (!check.ok) throw new Error(check.error);

  const storageKey = await storage.store(buffer, mimeType);

  const asset = await prisma.mediaAsset.create({
    data: {
      name: (name || originalFilename || 'Untitled').slice(0, 150),
      originalFilename: originalFilename || 'upload',
      storageKey,
      mimeType,
      mediaType: check.mediaType,
      sizeBytes: buffer.length,
      category: CATEGORIES.includes(category) ? category : 'Other',
      uploadedById: uploadedById || null,
    },
  });

  await timeline.logEvent({
    contactId: null,
    actorId: uploadedById,
    action: 'media_uploaded',
    entity: 'media_asset',
    entityId: asset.id,
    meta: { name: asset.name, mediaType: asset.mediaType },
  });

  return asset;
}

async function listMedia({ search, mediaType, category, page = 1, pageSize = 30 } = {}) {
  const where = { AND: [] };
  if (search) where.AND.push({ name: { contains: search, mode: 'insensitive' } });
  if (mediaType) where.AND.push({ mediaType });
  if (category) where.AND.push({ category });
  if (!where.AND.length) delete where.AND;

  const [total, assets] = await Promise.all([
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { assets, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function getMedia(id) {
  return prisma.mediaAsset.findUnique({ where: { id } });
}

/** Returns { buffer, mimeType } for streaming this asset's bytes back. */
async function getMediaFile(id) {
  const asset = await getMedia(id);
  if (!asset) return null;
  const blob = await storage.retrieve(asset.storageKey);
  if (!blob) return null;
  return { buffer: blob.buffer, mimeType: asset.mimeType, filename: asset.originalFilename };
}

async function updateMedia(id, { name, category }) {
  const data = {};
  if (name !== undefined) data.name = String(name).slice(0, 150);
  if (category !== undefined) data.category = CATEGORIES.includes(category) ? category : 'Other';
  return prisma.mediaAsset.update({ where: { id }, data });
}

/** Checks whether any template still references this asset before deleting. */
async function deleteMedia(id) {
  const referencingTemplates = await prisma.whatsappTemplate.findMany({
    where: { headerMediaId: id },
    select: { id: true, name: true },
  });
  if (referencingTemplates.length) {
    const err = new Error(
      `Cannot delete — used as the header sample for template(s): ${referencingTemplates.map((t) => t.name).join(', ')}.`
    );
    err.code = 'MEDIA_IN_USE';
    throw err;
  }

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return;
  await storage.remove(asset.storageKey);
  await prisma.mediaAsset.delete({ where: { id } });

  await timeline.logEvent({
    contactId: null,
    action: 'media_deleted',
    entity: 'media_asset',
    entityId: id,
    meta: { name: asset.name },
  });
}

/** Simple accessor for other services (templates, future campaigns) to depend on. */
async function resolveMedia(id) {
  return getMedia(id);
}

/**
 * Uploads (or re-uploads) this asset to Meta's normal media endpoint for
 * use in an outbound message. NOT the same as a template header sample
 * handle (see uploadTemplateHeaderSample in whatsapp.js) — Meta media IDs
 * also aren't permanent, so this may need to be called again later.
 */
async function ensureMetaMedia(id) {
  const asset = await getMedia(id);
  if (!asset) throw new Error('Media asset not found.');
  if (!whatsapp.isConfigured()) throw new Error('WhatsApp Cloud API is not configured.');

  const blob = await storage.retrieve(asset.storageKey);
  if (!blob) throw new Error('Stored file is missing.');

  const result = await whatsapp.uploadMedia(blob.buffer, asset.mimeType, asset.originalFilename);
  const updated = await prisma.mediaAsset.update({
    where: { id },
    data: { metaMediaId: result.id, metaMediaUploadedAt: new Date() },
  });
  return updated;
}

function validateMediaForMessageType(asset, messageType) {
  if (!asset) return { ok: false, error: 'Media asset not found.' };
  if (messageType === 'image' && asset.mediaType !== 'image') return { ok: false, error: 'An image is required.' };
  if (messageType === 'video' && asset.mediaType !== 'video') return { ok: false, error: 'A video is required.' };
  if (messageType === 'document' && asset.mediaType !== 'document') return { ok: false, error: 'A document is required.' };
  return { ok: true };
}

module.exports = {
  CATEGORIES,
  validateUpload,
  uploadMedia,
  listMedia,
  getMedia,
  getMediaFile,
  updateMedia,
  deleteMedia,
  resolveMedia,
  ensureMetaMedia,
  validateMediaForMessageType,
};
