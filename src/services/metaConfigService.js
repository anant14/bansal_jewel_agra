'use strict';

const crypto = require('crypto');
const prisma = require('../db/prisma');
const config = require('../config');
const logger = require('../utils/logger');

const ALGO = 'aes-256-gcm';
const SETTING_ID = 'default';

/**
 * ONE resolver for Meta configuration, used by everything (WhatsApp
 * service, TemplateService, MediaService, RateDelivery indirectly via
 * WhatsApp service). Precedence: a value saved in Settings (database,
 * encrypted where secret) always wins; an environment variable is only
 * the fallback for whatever hasn't been configured in the UI yet.
 *
 * Secrets are AES-256-GCM encrypted with SETTINGS_ENCRYPTION_KEY, an env
 * var that is never written to the database. Without that key set,
 * saving a new secret is refused outright rather than falling back to
 * plaintext storage.
 *
 * refreshConfigCache() mutates config.whatsapp's properties IN PLACE
 * (never replaces the object) so every module that already captured a
 * reference to it (`const WA = config.whatsapp`) sees updates immediately
 * — no restart needed when an admin changes Settings. It is re-run after
 * every save, once at boot, and on a periodic timer as a safety net.
 */

function getEncryptionKey() {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest(); // any-length secret -> 32 bytes
}

function encryptionAvailable() {
  return Boolean(getEncryptionKey());
}

function encrypt(plainText) {
  const key = getEncryptionKey();
  if (!key) throw new Error('SETTINGS_ENCRYPTION_KEY is not set on the server — cannot store secrets securely yet.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payload) {
  const key = getEncryptionKey();
  if (!key || !payload) return null;
  try {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err) {
    logger.error('metaConfig: failed to decrypt a stored secret', err.message);
    return null;
  }
}

/** Never a full secret — only enough to recognize which one is saved. */
function maskSecret(secret) {
  if (!secret) return null;
  return '••••••••••••' + secret.slice(-4);
}

async function getRow() {
  try {
    return await prisma.metaSetting.findUnique({ where: { id: SETTING_ID } });
  } catch (err) {
    logger.error('metaConfig: failed to load settings row', err.message);
    return null;
  }
}

/** Re-reads the database row and mutates the live config.whatsapp object in place. Safe to call repeatedly. */
async function refreshConfigCache() {
  const row = await getRow();
  if (!row) return;

  if (row.appId) config.whatsapp.appId = row.appId;
  if (row.wabaId) config.whatsapp.businessAccountId = row.wabaId;
  if (row.phoneNumberId) config.whatsapp.phoneNumberId = row.phoneNumberId;
  if (row.graphVersion) config.whatsapp.graphVersion = row.graphVersion;
  if (row.verifyToken) config.whatsapp.verifyToken = row.verifyToken;
  if (row.rateTemplateName) config.whatsapp.rateTemplateName = row.rateTemplateName;
  if (row.rateTemplateLang) config.whatsapp.rateTemplateLang = row.rateTemplateLang;

  const token = row.encryptedToken ? decrypt(row.encryptedToken) : null;
  if (token) config.whatsapp.token = token;
  const appSecret = row.encryptedAppSecret ? decrypt(row.encryptedAppSecret) : null;
  if (appSecret) config.whatsapp.appSecret = appSecret;

  config.whatsapp.isConfigured = Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);
}

function fieldSource(dbValue, envValue) {
  if (dbValue) return 'database';
  if (envValue) return 'env';
  return 'unset';
}

/** Everything the Settings UI needs to render — secrets always masked, never raw. */
async function getDisplaySettings() {
  const row = await getRow();
  const token = row && row.encryptedToken ? decrypt(row.encryptedToken) : (process.env.WHATSAPP_TOKEN || null);
  const appSecret = row && row.encryptedAppSecret ? decrypt(row.encryptedAppSecret) : (process.env.WHATSAPP_APP_SECRET || null);

  return {
    appId: (row && row.appId) || process.env.WHATSAPP_APP_ID || '',
    appIdSource: fieldSource(row && row.appId, process.env.WHATSAPP_APP_ID),
    wabaId: (row && row.wabaId) || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    wabaIdSource: fieldSource(row && row.wabaId, process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    businessPortfolioId: (row && row.businessPortfolioId) || '',
    phoneNumberId: (row && row.phoneNumberId) || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    phoneNumberIdSource: fieldSource(row && row.phoneNumberId, process.env.WHATSAPP_PHONE_NUMBER_ID),
    graphVersion: (row && row.graphVersion) || process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
    verifyToken: (row && row.verifyToken) || process.env.WHATSAPP_VERIFY_TOKEN || '',
    rateTemplateName: (row && row.rateTemplateName) || process.env.WHATSAPP_RATE_TEMPLATE_NAME || '',
    rateTemplateLang: (row && row.rateTemplateLang) || process.env.WHATSAPP_RATE_TEMPLATE_LANG || 'en_US',
    embeddedSignupConfigId: (row && row.embeddedSignupConfigId) || '',
    tokenConfigured: Boolean(token),
    tokenMasked: maskSecret(token),
    tokenSource: fieldSource(row && row.encryptedToken, process.env.WHATSAPP_TOKEN),
    appSecretConfigured: Boolean(appSecret),
    appSecretMasked: maskSecret(appSecret),
    appSecretSource: fieldSource(row && row.encryptedAppSecret, process.env.WHATSAPP_APP_SECRET),
    lastVerifiedAt: row ? row.lastVerifiedAt : null,
    lastVerifyStatus: row ? row.lastVerifyStatus : null,
    lastVerifyError: row ? row.lastVerifyError : null,
    encryptionAvailable: encryptionAvailable(),
  };
}

/**
 * Saves whatever fields were actually provided. A blank/omitted token or
 * app secret input NEVER blanks out an existing saved secret — only a
 * genuinely new value typed into the (always-masked) field replaces it.
 */
async function saveSettings(input, actorId) {
  const data = {};
  const plainFields = ['appId', 'wabaId', 'businessPortfolioId', 'phoneNumberId', 'graphVersion', 'verifyToken', 'rateTemplateName', 'rateTemplateLang', 'embeddedSignupConfigId'];
  for (const field of plainFields) {
    if (input[field] !== undefined) data[field] = input[field] ? String(input[field]).trim() : null;
  }

  if (input.token) data.encryptedToken = encrypt(input.token);
  if (input.appSecret) data.encryptedAppSecret = encrypt(input.appSecret);

  data.updatedById = actorId || null;

  await prisma.metaSetting.upsert({
    where: { id: SETTING_ID },
    update: data,
    create: { id: SETTING_ID, ...data },
  });

  await refreshConfigCache();

  const timeline = require('./timelineService');
  await timeline.logEvent({
    contactId: null,
    actorId,
    action: 'meta_settings_changed',
    entity: 'meta_settings',
    entityId: SETTING_ID,
    meta: {
      fieldsChanged: plainFields.filter((f) => input[f] !== undefined),
      tokenChanged: Boolean(input.token),
      appSecretChanged: Boolean(input.appSecret),
    },
  });
}

async function recordVerifyResult(status, error) {
  await prisma.metaSetting.upsert({
    where: { id: SETTING_ID },
    update: { lastVerifiedAt: new Date(), lastVerifyStatus: status, lastVerifyError: error || null },
    create: { id: SETTING_ID, lastVerifiedAt: new Date(), lastVerifyStatus: status, lastVerifyError: error || null },
  });
}

/** Extracts a safe, structured summary from a Meta API error — never the token/app secret. */
function describeMetaError(err) {
  const meta = err && err.details && err.details.error;
  if (!meta) return { message: (err && err.message) || 'Unknown error' };
  return {
    code: meta.code,
    subcode: meta.error_subcode,
    type: meta.type,
    message: meta.message,
    fbtraceId: meta.fbtrace_id,
  };
}

async function logMetaError(operation, err) {
  const details = describeMetaError(err);
  const timeline = require('./timelineService');
  await timeline.logEvent({
    contactId: null,
    action: 'meta_api_error',
    entity: 'meta_settings',
    entityId: SETTING_ID,
    meta: { operation, ...details },
  });
  return details;
}

/**
 * The Part 6 "Test Meta Connection" action — two harmless, read-only
 * Graph API calls (WABA info + phone number info). Never fabricates a
 * field Meta doesn't actually return; only what's genuinely in the
 * response is surfaced to the admin.
 */
async function testConnection(actorId) {
  const whatsapp = require('./whatsapp');
  const result = { wabaOk: false, phoneOk: false, waba: null, phone: null, error: null };

  try {
    result.waba = await whatsapp.getWabaInfo();
    result.wabaOk = true;
  } catch (err) {
    result.error = describeMetaError(err);
    await logMetaError('test_connection_waba', err);
  }

  try {
    result.phone = await whatsapp.getPhoneNumberInfo();
    result.phoneOk = true;
  } catch (err) {
    if (!result.error) result.error = describeMetaError(err);
    await logMetaError('test_connection_phone', err);
  }

  const status = result.wabaOk && result.phoneOk ? 'connected' : 'error';
  await recordVerifyResult(status, result.error ? result.error.message : null);

  const timeline = require('./timelineService');
  await timeline.logEvent({
    contactId: null,
    actorId,
    action: 'meta_connection_test',
    entity: 'meta_settings',
    entityId: SETTING_ID,
    meta: { status, wabaOk: result.wabaOk, phoneOk: result.phoneOk },
  });

  // Mirror the result onto the default WhatsappAccount row too, so it's
  // visible from the multi-number-ready account model (Part 5/10).
  try {
    const whatsappAccountService = require('./whatsappAccountService');
    const account = await whatsappAccountService.getDefaultAccount();
    await prisma.whatsappAccount.update({
      where: { id: account.id },
      data: {
        lastConnectionTestAt: new Date(),
        lastConnectionStatus: status,
        lastConnectionError: result.error ? result.error.message : null,
        displayName: result.phone ? result.phone.verified_name || null : undefined,
        qualityRating: result.phone ? result.phone.quality_rating || null : undefined,
        displayPhoneNumber: result.phone ? result.phone.display_phone_number || null : undefined,
      },
    });
  } catch (err) {
    logger.error('metaConfig: failed to persist connection result on account row', err.message);
  }

  return { ...result, status };
}

/** Part 8 — inspects the current token's granted scopes. Reports "unable to verify" rather than guessing when Meta's response shape is unexpected. */
async function checkPermissions() {
  const whatsapp = require('./whatsapp');
  const REQUIRED = ['whatsapp_business_messaging', 'whatsapp_business_management'];
  try {
    const data = await whatsapp.debugToken();
    if (!data || !Array.isArray(data.scopes)) {
      return { status: 'unable_to_verify', scopes: null, missing: null };
    }
    const missing = REQUIRED.filter((p) => !data.scopes.includes(p));
    return { status: missing.length ? 'missing' : 'available', scopes: data.scopes, missing, raw: data };
  } catch (err) {
    await logMetaError('check_permissions', err);
    return { status: 'unable_to_verify', scopes: null, missing: null, error: describeMetaError(err) };
  }
}

/** Part 9 — lists phone numbers on the configured WABA so the admin can pick one instead of copying an ID by hand. */
async function discoverPhoneNumbers() {
  const whatsapp = require('./whatsapp');
  return whatsapp.listPhoneNumbers();
}

async function selectPhoneNumber(phoneNumberId, actorId) {
  const whatsapp = require('./whatsapp');
  const info = await whatsapp.getPhoneNumberInfo(phoneNumberId);

  await saveSettings({ phoneNumberId }, actorId);

  const whatsappAccountService = require('./whatsappAccountService');
  const account = await whatsappAccountService.getDefaultAccount();
  await prisma.whatsappAccount.update({
    where: { id: account.id },
    data: {
      phoneNumberId,
      displayPhoneNumber: info.display_phone_number || null,
      displayName: info.verified_name || null,
      qualityRating: info.quality_rating || null,
    },
  });

  const timeline = require('./timelineService');
  await timeline.logEvent({
    contactId: null,
    actorId,
    action: 'phone_number_selected',
    entity: 'whatsapp_account',
    entityId: account.id,
    meta: { phoneNumberId, displayPhoneNumber: info.display_phone_number },
  });

  return info;
}

/** Part 23 — a single, honest snapshot. Every field here is a real DB count or a real config check; nothing is invented. */
async function getHealthDashboard() {
  const settings = await getDisplaySettings();
  const [templateCounts, lastWebhookEvent, lastInboundMessage, lastWebhookError, verifiedMetaMedia, account] = await Promise.all([
    prisma.whatsappTemplate.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.webhookEvent.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.message.findFirst({ where: { direction: 'inbound' }, orderBy: { createdAt: 'desc' } }),
    prisma.webhookEvent.findFirst({ where: { NOT: { error: null } }, orderBy: { createdAt: 'desc' } }),
    prisma.mediaAsset.findFirst({ where: { NOT: { metaMediaId: null } } }),
    prisma.whatsappAccount.findFirst({ where: { isDefault: true } }),
  ]);

  const templateStatusCounts = {};
  for (const row of templateCounts) templateStatusCounts[row.status] = row._count._all;

  const recentWebhookWindowMs = 24 * 60 * 60 * 1000;
  const webhookRecent = lastWebhookEvent && Date.now() - new Date(lastWebhookEvent.createdAt).getTime() < recentWebhookWindowMs;

  return {
    metaApi: {
      status: settings.lastVerifyStatus === 'connected' ? 'connected' : settings.lastVerifyStatus === 'error' ? 'error' : 'unknown',
      lastTestedAt: settings.lastVerifiedAt,
    },
    waba: { status: settings.wabaId ? (settings.lastVerifyStatus === 'connected' ? 'connected' : 'configured_unverified') : 'missing' },
    phoneNumber: {
      status: settings.phoneNumberId ? (account && account.lastConnectionStatus === 'connected' ? 'connected' : 'configured_unverified') : 'missing',
      account,
    },
    webhook: {
      status: !lastWebhookEvent ? 'no_events_yet' : webhookRecent ? 'receiving' : 'no_recent_events',
      lastReceivedAt: lastWebhookEvent ? lastWebhookEvent.createdAt : null,
      lastSuccessfulMessageAt: lastInboundMessage ? lastInboundMessage.createdAt : null,
      lastError: lastWebhookError ? { at: lastWebhookError.createdAt, message: lastWebhookError.error } : null,
    },
    templates: {
      approved: templateStatusCounts.approved || 0,
      pendingReview: templateStatusCounts.pending_review || 0,
      rejected: templateStatusCounts.rejected || 0,
      localDraft: templateStatusCounts.local_draft || 0,
    },
    media: { status: verifiedMetaMedia ? 'verified' : 'not_yet_verified' },
  };
}

/** Part 24/25 — status only ever reflects what we can actually determine; never claims "Eligible" without a live, verified connection. */
async function getCoexistenceReadiness() {
  const settings = await getDisplaySettings();
  const connected = settings.lastVerifyStatus === 'connected';
  return {
    status: !settings.wabaId || !settings.tokenConfigured ? 'not_configured' : connected ? 'setup_required' : 'unable_to_verify',
    embeddedSignup: {
      appIdConfigured: Boolean(settings.appId),
      configIdConfigured: Boolean(settings.embeddedSignupConfigId),
      status: settings.appId && settings.embeddedSignupConfigId ? 'foundation_ready' : 'missing_prerequisites',
      missingPrerequisites: [
        !settings.appId && 'Meta App ID',
        !settings.embeddedSignupConfigId && 'Facebook Login for Business Configuration ID (from the Meta App dashboard)',
        !connected && 'A verified Meta connection',
      ].filter(Boolean),
    },
  };
}

/** Part 26 — an honest checklist; anything not verifiable from our own data is marked accordingly, never assumed done. */
async function getAppReviewChecklist() {
  const settings = await getDisplaySettings();
  const health = await getHealthDashboard();

  const item = (label, state, note) => ({ label, state, note });

  return [
    item('Meta App Configured', settings.appId ? 'verified' : 'needs_action'),
    item('WABA Connected', health.waba.status === 'connected' ? 'verified' : health.waba.status === 'missing' ? 'needs_action' : 'unable_to_verify'),
    item('Phone Number Connected', health.phoneNumber.status === 'connected' ? 'verified' : health.phoneNumber.status === 'missing' ? 'needs_action' : 'unable_to_verify'),
    item('Webhook Working', health.webhook.status === 'receiving' ? 'verified' : 'needs_action', health.webhook.status),
    item('Template Sync Working', health.templates.approved + health.templates.pendingReview + health.templates.rejected > 0 ? 'verified' : 'unable_to_verify'),
    item('Approved Template Available', health.templates.approved > 0 ? 'verified' : 'needs_action'),
    item('Real Outbound Send Verified', 'needs_action', 'No message has been confirmed sent through a real Meta API response yet.'),
    item('Real Incoming Message Verified', health.webhook.lastSuccessfulMessageAt ? 'verified' : 'needs_action'),
    item('Media Upload Verified', health.media.status === 'verified' ? 'verified' : 'needs_action'),
    item('Privacy Policy URL', 'verified', '/privacy-policy'),
    item('Terms URL', 'verified', '/terms-of-service'),
    item('Data Deletion URL', 'verified', '/data-deletion'),
    item('Business Verification', 'manual', 'Only Meta Business Manager can confirm this — check there directly.'),
  ];
}

module.exports = {
  SETTING_ID,
  encryptionAvailable,
  maskSecret,
  refreshConfigCache,
  getDisplaySettings,
  saveSettings,
  recordVerifyResult,
  describeMetaError,
  logMetaError,
  testConnection,
  checkPermissions,
  discoverPhoneNumbers,
  selectPhoneNumber,
  getHealthDashboard,
  getCoexistenceReadiness,
  getAppReviewChecklist,
};
