'use strict';

const prisma = require('../db/prisma');
const whatsapp = require('./whatsapp');
const rateService = require('./rateService');
const conversationService = require('./conversationService');
const timeline = require('./timelineService');

/**
 * The ONE place any feature (admin UI, RateDelivery, future Campaigns)
 * touches WhatsApp templates. Meta is always authoritative for anything
 * beyond 'local_draft' — nothing here may set a template to 'approved'
 * except mapMetaStatus() reading it directly off a real Meta response.
 */

const META_STATUS_MAP = {
  APPROVED: 'approved',
  PENDING_REVIEW: 'pending_review',
  PENDING: 'pending_review',
  REJECTED: 'rejected',
  PAUSED: 'paused',
  DISABLED: 'disabled',
  IN_APPEAL: 'pending_review',
};

function mapMetaStatus(metaStatus) {
  return META_STATUS_MAP[String(metaStatus || '').toUpperCase()] || 'unknown';
}

function extractComponent(components, type) {
  return (components || []).find((c) => String(c.type).toUpperCase() === type) || null;
}

/** Pulls our display-friendly columns out of a Meta (or locally-built) components array. */
function deriveFieldsFromComponents(components) {
  const header = extractComponent(components, 'HEADER');
  const body = extractComponent(components, 'BODY');
  const footer = extractComponent(components, 'FOOTER');

  let headerType = 'none';
  let headerText = null;
  if (header) {
    headerType = String(header.format || 'TEXT').toLowerCase();
    if (headerType === 'text') headerText = header.text || null;
  }

  return {
    headerType,
    headerText,
    bodyText: body ? body.text || '' : '',
    footerText: footer ? footer.text || null : null,
  };
}

/** Maps a raw Meta template object (from list/get) onto our local column shape. */
function mapMetaTemplate(metaTemplate) {
  const fields = deriveFieldsFromComponents(metaTemplate.components);
  return {
    metaTemplateId: String(metaTemplate.id),
    name: metaTemplate.name,
    category: String(metaTemplate.category || '').toLowerCase(),
    language: metaTemplate.language,
    status: mapMetaStatus(metaTemplate.status),
    qualityRating: metaTemplate.quality_score ? metaTemplate.quality_score.score : null,
    componentsJson: metaTemplate.components || [],
    rejectionReason: metaTemplate.rejected_reason || null,
    ...fields,
  };
}

/** {{1}}, {{2}}, ... found in a body text, in order, de-duplicated. */
function extractPositionalVariables(bodyText) {
  const found = new Set();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m;
  while ((m = re.exec(bodyText || ''))) found.add(Number(m[1]));
  return Array.from(found).sort((a, b) => a - b);
}

const VARIABLE_SOURCES = [
  { value: 'static', label: 'Static test value' },
  { value: 'customer_name', label: 'Customer Name' },
  { value: 'current_date', label: 'Current Date' },
  { value: 'rate:GOLD_24K', label: 'Gold 24K Rate' },
  { value: 'rate:GOLD_22K', label: 'Gold 22K Rate' },
  { value: 'rate:GOLD_18K', label: 'Gold 18K Rate' },
  { value: 'rate:SILVER', label: 'Silver Rate' },
];

/**
 * Every {{n}} in the body must have a variable definition with either a
 * source or (for 'static') a non-empty example value — Meta requires a
 * real example for every variable at submission time regardless.
 */
function validateVariables(bodyText, variables) {
  const positions = extractPositionalVariables(bodyText);
  const errors = [];
  const byPosition = new Map((variables || []).map((v) => [Number(v.position), v]));

  for (const pos of positions) {
    const def = byPosition.get(pos);
    if (!def) {
      errors.push(`Variable {{${pos}}} has no mapping.`);
      continue;
    }
    if (!VARIABLE_SOURCES.some((s) => s.value === def.source)) {
      errors.push(`Variable {{${pos}}} has an unrecognized source.`);
    }
    if (def.source === 'static' && !String(def.example || '').trim()) {
      errors.push(`Variable {{${pos}}} needs an example value.`);
    }
    if (def.source !== 'static' && !String(def.example || '').trim()) {
      errors.push(`Variable {{${pos}}} needs an example value for Meta submission.`);
    }
  }

  return { ok: errors.length === 0, errors, positions };
}

async function listLocalTemplates({ search, status, category, language, page = 1, pageSize = 25 } = {}) {
  const where = { AND: [] };
  if (search) where.AND.push({ name: { contains: search, mode: 'insensitive' } });
  if (status) where.AND.push({ status });
  if (category) where.AND.push({ category });
  if (language) where.AND.push({ language });
  if (!where.AND.length) delete where.AND;

  const [total, templates] = await Promise.all([
    prisma.whatsappTemplate.count({ where }),
    prisma.whatsappTemplate.findMany({
      where,
      include: { headerMedia: true },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { templates, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function getTemplate(id) {
  return prisma.whatsappTemplate.findUnique({ where: { id }, include: { headerMedia: true, whatsappAccount: true } });
}

async function listApprovedTemplates() {
  return prisma.whatsappTemplate.findMany({ where: { status: 'approved' }, orderBy: { name: 'asc' } });
}

/** Looks up an approved template by name — returns null if it doesn't exist or isn't approved yet. */
async function getApprovedTemplateByName(name) {
  if (!name) return null;
  return prisma.whatsappTemplate.findFirst({ where: { name, status: 'approved' } });
}

async function getTemplateVariables(templateId) {
  const t = await prisma.whatsappTemplate.findUnique({ where: { id: templateId } });
  return t ? t.variablesJson || [] : [];
}

/** Creates a LOCAL DRAFT only — no Meta call. Never sendable until submitted and approved. */
async function createTemplate(input, whatsappAccountId, actorId) {
  const { name, category, language, headerType, headerText, headerMediaId, bodyText, footerText, buttons, variables } = input;

  if (!/^[a-z0-9_]{1,512}$/.test(name || '')) {
    throw new Error('Template name must be lowercase letters, numbers and underscores only.');
  }
  const validation = validateVariables(bodyText, variables);
  if (!validation.ok) throw new Error(validation.errors.join(' '));

  const components = buildComponents({ headerType, headerText, headerMediaId, bodyText, footerText, buttons, variables });

  const template = await prisma.whatsappTemplate.create({
    data: {
      whatsappAccountId,
      name,
      category,
      language,
      status: 'local_draft',
      headerType: headerType || 'none',
      headerText: headerText || null,
      headerMediaId: headerMediaId || null,
      bodyText,
      footerText: footerText || null,
      componentsJson: components,
      variablesJson: variables || [],
      createdById: actorId || null,
    },
  });

  await timeline.logEvent({
    contactId: null,
    actorId,
    action: 'template_created_local',
    entity: 'template',
    entityId: template.id,
    meta: { name: template.name },
  });

  return template;
}

/** Builds the Meta components array from our editable fields, including examples. */
function buildComponents({ headerType, headerText, headerMediaId, bodyText, footerText, buttons, variables }) {
  const components = [];

  if (headerType && headerType !== 'none') {
    if (headerType === 'text') {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText || '' });
    } else {
      // IMAGE/VIDEO/DOCUMENT — Meta needs a sample "header_handle" from the
      // resumable-upload flow (uploadTemplateHeaderSample), filled in at
      // submission time in submitToMeta() once the media's handle is known.
      components.push({ type: 'HEADER', format: headerType.toUpperCase(), example: { header_handle: [] } });
    }
  }

  const bodyComponent = { type: 'BODY', text: bodyText };
  const positions = extractPositionalVariables(bodyText);
  if (positions.length) {
    const examples = positions.map((pos) => {
      const def = (variables || []).find((v) => Number(v.position) === pos);
      return def ? String(def.example || '') : '';
    });
    bodyComponent.example = { body_text: [examples] };
  }
  components.push(bodyComponent);

  if (footerText) components.push({ type: 'FOOTER', text: footerText });

  if (buttons && buttons.length) {
    components.push({ type: 'BUTTONS', buttons: buttons.map(mapButtonInput) });
  }

  return components;
}

function mapButtonInput(btn) {
  if (btn.type === 'URL') return { type: 'URL', text: btn.text, url: btn.url };
  if (btn.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phoneNumber };
  return { type: 'QUICK_REPLY', text: btn.text };
}

/** Submits a local draft to Meta. On success, updates the local row with the real Meta id/status — never assumes approval. */
async function submitToMeta(templateId, actorId) {
  const template = await prisma.whatsappTemplate.findUnique({ where: { id: templateId }, include: { headerMedia: true } });
  if (!template) throw new Error('Template not found.');
  if (template.status !== 'local_draft') throw new Error('Only a local draft can be submitted.');

  let components = template.componentsJson;

  // Resolve a real header sample handle right before submission, if needed.
  const headerComponent = extractComponent(components, 'HEADER');
  if (headerComponent && headerComponent.format !== 'TEXT' && template.headerMedia) {
    const mediaService = require('./mediaService');
    const file = await mediaService.getMediaFile(template.headerMedia.id);
    if (!file) throw new Error('The selected header media could not be loaded.');
    const handle = await whatsapp.uploadTemplateHeaderSample(file.buffer, file.mimeType, file.filename);
    components = components.map((c) =>
      c.type === 'HEADER' ? { ...c, example: { header_handle: [handle] } } : c
    );
  }

  const payload = {
    name: template.name,
    category: template.category.toUpperCase(),
    language: template.language,
    components,
  };

  const result = await whatsapp.createMetaTemplate(payload);

  const updated = await prisma.whatsappTemplate.update({
    where: { id: templateId },
    data: {
      metaTemplateId: String(result.id),
      status: mapMetaStatus(result.status || 'PENDING_REVIEW'),
      componentsJson: components,
      lastSyncedAt: new Date(),
    },
  });

  await timeline.logEvent({
    contactId: null,
    actorId,
    action: 'template_submitted_to_meta',
    entity: 'template',
    entityId: template.id,
    meta: { name: template.name, metaTemplateId: updated.metaTemplateId, status: updated.status },
  });

  return updated;
}

/** Fetches every template on the configured WABA and upserts by meta_template_id. Idempotent. */
async function syncFromMeta(whatsappAccountId, actorId) {
  const metaTemplates = await whatsapp.listMetaTemplates();
  let created = 0;
  let updated = 0;

  for (const mt of metaTemplates) {
    const mapped = mapMetaTemplate(mt);
    const existing = await prisma.whatsappTemplate.findUnique({ where: { metaTemplateId: mapped.metaTemplateId } });

    if (existing) {
      await prisma.whatsappTemplate.update({
        where: { id: existing.id },
        data: { ...mapped, lastSyncedAt: new Date() },
      });
      updated += 1;
    } else {
      await prisma.whatsappTemplate.create({
        data: { ...mapped, whatsappAccountId, lastSyncedAt: new Date() },
      });
      created += 1;
    }
  }

  await timeline.logEvent({
    contactId: null,
    actorId,
    action: 'template_sync',
    entity: 'template',
    entityId: null,
    meta: { created, updated, total: metaTemplates.length },
  });

  return { created, updated, total: metaTemplates.length };
}

/** Re-fetches ONE template's current state from Meta. */
async function refreshTemplateStatus(templateId, actorId) {
  const template = await prisma.whatsappTemplate.findUnique({ where: { id: templateId } });
  if (!template || !template.metaTemplateId) throw new Error('This template has not been submitted to Meta yet.');

  const metaTemplate = await whatsapp.getMetaTemplate(template.metaTemplateId);
  const mapped = mapMetaTemplate(metaTemplate);
  const previousStatus = template.status;

  const updated = await prisma.whatsappTemplate.update({
    where: { id: templateId },
    data: { ...mapped, lastSyncedAt: new Date() },
  });

  if (previousStatus !== updated.status) {
    await timeline.logEvent({
      contactId: null,
      actorId,
      action: 'template_status_changed',
      entity: 'template',
      entityId: template.id,
      meta: { name: template.name, from: previousStatus, to: updated.status },
    });
  }

  return updated;
}

/** Resolves every variable for a specific contact/context. Throws if any rate variable isn't CURRENT — never sends a stale/fabricated price. */
async function resolveTemplate(templateId, contact) {
  const template = await getTemplate(templateId);
  if (!template) throw new Error('Template not found.');
  const variables = template.variablesJson || [];

  let currentRates = null;
  const values = [];

  for (const def of variables.sort((a, b) => a.position - b.position)) {
    if (def.source === 'customer_name') {
      values.push(contact.name || contact.whatsappNumber);
    } else if (def.source === 'current_date') {
      values.push(
        new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })
      );
    } else if (String(def.source || '').startsWith('rate:')) {
      const code = def.source.split(':')[1];
      if (!currentRates) currentRates = await rateService.getCurrentRates();
      const match = currentRates.find((r) => r.rateType.code === code);
      if (!match || match.status !== 'current') {
        throw new Error(`Rate for ${code} is not current — cannot send this template right now.`);
      }
      values.push(`₹${Number(match.entry.value).toLocaleString('en-IN')} / ${match.rateType.unit}`);
    } else {
      values.push(def.example || '');
    }
  }

  return values;
}

function prepareTemplatePayload(template, values) {
  return [{ type: 'body', parameters: values.map((v) => ({ type: 'text', text: String(v) })) }];
}

/** One-recipient send using an APPROVED template only. */
async function sendTemplateToContact(template, contact, whatsappAccount, values, actorId) {
  if (template.status !== 'approved') throw new Error('Only an approved template may be sent.');

  const components = prepareTemplatePayload(template, values);
  let sendResult;
  try {
    sendResult = await whatsapp.sendTemplate(contact.whatsappNumber, template.name, template.language, components);
  } catch (err) {
    sendResult = { skipped: true, error: err.message };
  }

  const { message } = await conversationService.recordOutboundMessage({
    contact,
    whatsappAccount,
    text: `[${template.name}] ` + template.bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n) - 1] || `{{${n}}}`),
    actorId,
    sendResult,
    type: 'template',
    templateName: template.name,
  });

  await timeline.logEvent({
    contactId: contact.id,
    actorId,
    action: 'template_test_sent',
    entity: 'message',
    entityId: message.id,
    meta: { templateName: template.name, status: message.status },
  });

  return message;
}

module.exports = {
  VARIABLE_SOURCES,
  mapMetaStatus,
  mapMetaTemplate,
  extractPositionalVariables,
  validateVariables,
  listLocalTemplates,
  getTemplate,
  listApprovedTemplates,
  getApprovedTemplateByName,
  getTemplateVariables,
  createTemplate,
  submitToMeta,
  syncFromMeta,
  refreshTemplateStatus,
  resolveTemplate,
  prepareTemplatePayload,
  sendTemplateToContact,
};
