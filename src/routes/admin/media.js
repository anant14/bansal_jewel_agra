'use strict';

const express = require('express');
const multer = require('multer');
const content = require('../../services/content');
const mediaService = require('../../services/mediaService');
const NAV = require('./nav');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // hard ceiling; mediaService enforces the real per-type limit
});

router.get('/media', async (req, res, next) => {
  try {
    const { search, mediaType, category } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const result = await mediaService.listMedia({ search, mediaType, category, page, pageSize: 24 });

    res.render('admin/media', {
      page: { title: 'Media Library — Admin' },
      brand: content.brand,
      nav: NAV,
      activeKey: 'media',
      adminName: req.session.adminName,
      result,
      categories: mediaService.CATEGORIES,
      filters: { search: search || '', mediaType: mediaType || '', category: category || '' },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/media/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).send('No file selected. <a href="/admin/media">Go back</a>');
    await mediaService.uploadMedia({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      name: req.body.name,
      category: req.body.category,
      uploadedById: req.session.adminUserId,
    });
    res.redirect('/admin/media');
  } catch (err) {
    res.status(400).send(`${err.message} <a href="/admin/media">Go back</a>`);
  }
});

router.get('/media/:id/file', async (req, res, next) => {
  try {
    const file = await mediaService.getMediaFile(req.params.id);
    if (!file) return res.sendStatus(404);
    res.set('Content-Type', file.mimeType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename || 'file')}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});

router.post('/media/:id/update', async (req, res, next) => {
  try {
    await mediaService.updateMedia(req.params.id, { name: req.body.name, category: req.body.category });
    res.redirect('/admin/media');
  } catch (err) {
    next(err);
  }
});

router.post('/media/:id/delete', async (req, res, next) => {
  try {
    await mediaService.deleteMedia(req.params.id);
    res.redirect('/admin/media');
  } catch (err) {
    if (err.code === 'MEDIA_IN_USE') {
      return res.status(409).send(`${err.message} <a href="/admin/media">Go back</a>`);
    }
    next(err);
  }
});

router.get('/api/media', async (req, res, next) => {
  try {
    const result = await mediaService.listMedia({ mediaType: req.query.mediaType, pageSize: 100 });
    res.json(result.assets);
  } catch (err) {
    next(err);
  }
});

router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof multer.MulterError) {
    return res.status(400).send(`Upload failed: ${err.message} <a href="/admin/media">Go back</a>`);
  }
  next(err);
});

module.exports = router;
