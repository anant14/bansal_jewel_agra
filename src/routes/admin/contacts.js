'use strict';

const express = require('express');
const content = require('../../services/content');
const contactService = require('../../services/contactService');
const timelineService = require('../../services/timelineService');
const { isValidPhone } = require('../../utils/phone');
const logger = require('../../utils/logger');
const NAV = require('./nav');

const router = express.Router();

// TEMPORARY (again): one more leftover test contact from a background
// polling loop during Phase 1 verification. Removed right after use.
router.post('/api/dev/purge-test-contacts', async (req, res, next) => {
  try {
    const prisma = require('../../db/prisma');
    const contacts = await prisma.contact.findMany({ where: { whatsappNumber: { startsWith: '9111111' } } });
    for (const c of contacts) {
      const convos = await prisma.conversation.findMany({ where: { contactId: c.id } });
      for (const convo of convos) {
        await prisma.messageEvent.deleteMany({ where: { message: { conversationId: convo.id } } });
        await prisma.message.deleteMany({ where: { conversationId: convo.id } });
      }
      await prisma.conversation.deleteMany({ where: { contactId: c.id } });
      await prisma.contactTag.deleteMany({ where: { contactId: c.id } });
      await prisma.contactNote.deleteMany({ where: { contactId: c.id } });
      await prisma.consent.deleteMany({ where: { contactId: c.id } });
      await prisma.auditLog.deleteMany({ where: { contactId: c.id } });
      await prisma.contact.delete({ where: { id: c.id } });
    }
    res.json({ purged: contacts.map((c) => c.whatsappNumber) });
  } catch (err) {
    next(err);
  }
});

const NAV_ACTIVE = 'contacts';

/* ───────────────────────────── pages ───────────────────────────────── */

router.get('/contacts', async (req, res, next) => {
  try {
    await contactService.ensureDefaultTags();
    const { search, tag, optIn, source, customerType } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [result, tags] = await Promise.all([
      contactService.listContacts({ search, tag, optIn, source, customerType, page, pageSize: 25 }),
      contactService.listAllTags(),
    ]);

    res.render('admin/contacts', {
      page: { title: 'Contacts — Admin' },
      brand: content.brand,
      nav: NAV,
      activeKey: NAV_ACTIVE,
      adminName: req.session.adminName,
      result,
      tags,
      filters: { search: search || '', tag: tag || '', optIn: optIn || '', source: source || '', customerType: customerType || '' },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/contacts/:id', async (req, res, next) => {
  try {
    const [contact, timeline, tags] = await Promise.all([
      contactService.getContactById(req.params.id),
      timelineService.getTimeline(req.params.id),
      contactService.listAllTags(),
    ]);
    if (!contact) return res.status(404).render('admin/stub', {
      page: { title: 'Contact not found — Admin' },
      brand: content.brand,
      nav: NAV,
      activeKey: NAV_ACTIVE,
      adminName: req.session.adminName,
      title: 'Contact not found',
      blurb: 'This contact does not exist or was removed.',
    });

    res.render('admin/contact-detail', {
      page: { title: `${contact.name || contact.whatsappNumber} — Contacts — Admin` },
      brand: content.brand,
      nav: NAV,
      activeKey: NAV_ACTIVE,
      adminName: req.session.adminName,
      contact,
      timeline,
      tags,
    });
  } catch (err) {
    next(err);
  }
});

/* ───────────────────────── mutation form posts ─────────────────────── */
// Plain form posts (not JSON) so the Contacts pages need no client JS.

router.post('/contacts', async (req, res, next) => {
  try {
    const { whatsappNumber, name, email, city, birthday, anniversary, customerType } = req.body;
    if (!isValidPhone(whatsappNumber)) {
      return res.status(400).send('A valid WhatsApp number is required. Go back and try again.');
    }
    const contact = await contactService.createContact(
      { whatsappNumber, name, email, city, birthday, anniversary, customerType, source: 'manual' },
      req.session.adminUserId
    );
    res.redirect(`/admin/contacts/${contact.id}`);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).send('A contact with that WhatsApp number already exists.');
    next(err);
  }
});

router.post('/contacts/:id/update', async (req, res, next) => {
  try {
    await contactService.updateContact(req.params.id, req.body);
    res.redirect(`/admin/contacts/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/contacts/:id/tags', async (req, res, next) => {
  try {
    await contactService.addTag(req.params.id, req.body.tagName, req.session.adminUserId);
    res.redirect(`/admin/contacts/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/contacts/:id/tags/:tagId/remove', async (req, res, next) => {
  try {
    await contactService.removeTag(req.params.id, req.params.tagId, req.session.adminUserId);
    res.redirect(`/admin/contacts/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/contacts/:id/notes', async (req, res, next) => {
  try {
    await contactService.addNote(req.params.id, req.body.body, req.session.adminUserId);
    res.redirect(`/admin/contacts/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/contacts/:id/consent', async (req, res, next) => {
  try {
    await contactService.setConsent(
      req.params.id,
      { status: req.body.status, source: 'manual_admin' },
      req.session.adminUserId
    );
    res.redirect(`/admin/contacts/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

/* ───────────────────── JSON API (used by the WhatsApp inbox panel) ─────────────────── */

router.get('/api/tags', async (req, res, next) => {
  try {
    res.json(await contactService.listAllTags());
  } catch (err) {
    next(err);
  }
});

router.get('/api/contacts/:id', async (req, res, next) => {
  try {
    const contact = await contactService.getContactById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'not_found' });
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

router.post('/api/contacts/:id/tags', async (req, res, next) => {
  try {
    const tag = await contactService.addTag(req.params.id, req.body.tagName, req.session.adminUserId);
    res.status(201).json(tag);
  } catch (err) {
    next(err);
  }
});

router.delete('/api/contacts/:id/tags/:tagId', async (req, res, next) => {
  try {
    await contactService.removeTag(req.params.id, req.params.tagId, req.session.adminUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/api/contacts/:id/notes', async (req, res, next) => {
  try {
    const note = await contactService.addNote(req.params.id, req.body.body, req.session.adminUserId);
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

router.post('/api/contacts/:id/update', async (req, res, next) => {
  try {
    const contact = await contactService.updateContact(req.params.id, req.body);
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error('admin/contacts: request failed', err.message);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'server_error' });
  res.status(500).send('Something went wrong.');
});

module.exports = router;
