'use strict';

const prisma = require('../../db/prisma');

/**
 * Stores file bytes in Postgres (media_blobs). Chosen because Render's
 * filesystem is ephemeral and no external object storage is configured —
 * Postgres is the one thing we have that's actually persistent. Fine for
 * a curated business media library; not meant for large-scale storage.
 */
async function store(key, buffer, mimeType) {
  await prisma.mediaBlob.create({ data: { key, data: buffer, mimeType } });
}

async function retrieve(key) {
  const blob = await prisma.mediaBlob.findUnique({ where: { key } });
  if (!blob) return null;
  return { buffer: Buffer.from(blob.data), mimeType: blob.mimeType };
}

async function remove(key) {
  await prisma.mediaBlob.deleteMany({ where: { key } });
}

module.exports = { store, retrieve, remove };
