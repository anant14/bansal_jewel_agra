'use strict';

const crypto = require('crypto');
const databaseProvider = require('./databaseProvider');

/**
 * The one seam between "the app" and "wherever bytes actually live".
 * Right now that's Postgres (see databaseProvider.js). Swapping to a real
 * object storage provider later (S3/R2/etc.) means writing a new module
 * with the same store/retrieve/remove(key) shape and changing only the
 * getProvider() line below — MediaAsset, MediaService, routes and views
 * never need to change.
 */
function getProvider() {
  return databaseProvider;
}

function generateKey() {
  return crypto.randomBytes(24).toString('hex');
}

async function store(buffer, mimeType) {
  const key = generateKey();
  await getProvider().store(key, buffer, mimeType);
  return key;
}

async function retrieve(key) {
  return getProvider().retrieve(key);
}

async function remove(key) {
  return getProvider().remove(key);
}

module.exports = { store, retrieve, remove };
