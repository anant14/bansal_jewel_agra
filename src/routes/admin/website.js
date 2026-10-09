'use strict';

const express = require('express');
const multer = require('multer');
const content = require('../../services/content');
const sitePhotoService = require('../../services/sitePhotoService');
const catalogService = require('../../services/catalogService');
const logger = require('../../utils/logger');
const NAV = require('./nav');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }, // photos are resized on upload, see mediaService.uploadWebsiteImage
});

function photoFrom(req) {
  return req.file ? { buffer: req.file.buffer, originalFilename: req.file.originalname } : null;
}

/** Validation messages are shown as-is; anything unexpected is logged, not shown. */
function friendly(err) {
  if (err && String(err.name || '').startsWith('PrismaClient')) {
    logger.error('admin website: database error', err.message);
    return 'Something went wrong while saving. Please try again.';
  }
  return err.message;
}

function withNotice(path, { saved, error }) {
  const qs = error ? `error=${encodeURIComponent(error)}` : `saved=${encodeURIComponent(saved)}`;
  return `${path}?${qs}`;
}

function base(req, activeKey, title) {
  return {
    page: { title: `${title} — Admin` },
    brand: content.brand,
    nav: NAV,
    activeKey,
    adminName: req.session.adminName,
    notice: { saved: req.query.saved || '', error: req.query.error || '' },
  };
}

/* ───────────────────────── homepage photos ───────────────────────── */

router.get('/website-photos', async (req, res, next) => {
  try {
    res.render('admin/website-photos', {
      ...base(req, 'website-photos', 'Website Photos'),
      placements: sitePhotoService.PLACEMENTS,
      photos: await sitePhotoService.listForAdmin(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/website-photos/:placement/add', upload.single('photo'), async (req, res) => {
  try {
    await sitePhotoService.addPhoto(req.params.placement, req.body, photoFrom(req), req.session.adminUserId);
    res.redirect(withNotice('/admin/website-photos', { saved: 'Photo added to the website.' }));
  } catch (err) {
    res.redirect(withNotice('/admin/website-photos', { error: friendly(err) }));
  }
});

router.post('/website-photos/:id/update', async (req, res) => {
  try {
    await sitePhotoService.updatePhoto(req.params.id, req.body);
    res.redirect(withNotice('/admin/website-photos', { saved: 'Photo updated.' }));
  } catch (err) {
    res.redirect(withNotice('/admin/website-photos', { error: friendly(err) }));
  }
});

router.post('/website-photos/:id/delete', async (req, res) => {
  try {
    await sitePhotoService.deletePhoto(req.params.id);
    res.redirect(withNotice('/admin/website-photos', { saved: 'Photo removed from the website.' }));
  } catch (err) {
    res.redirect(withNotice('/admin/website-photos', { error: friendly(err) }));
  }
});

/* ──────────────────────────── catalogue ──────────────────────────── */

router.get('/catalogue', async (req, res, next) => {
  try {
    await catalogService.ensureImported(req.session.adminUserId);
    res.render('admin/catalogue', {
      ...base(req, 'catalogue', 'Catalogue'),
      products: await catalogService.listForAdmin(),
      categories: catalogService.categories(),
      imageOf: (p) => catalogService.toView(p).image,
    });
  } catch (err) {
    next(err);
  }
});

function renderProductForm(req, res, { product, values, error }) {
  // A file input can't be pre-filled, so a rejected upload has to be chosen again.
  const photoLost = Boolean(error && req.file);
  res.status(error ? 400 : 200).render('admin/product-form', {
    ...base(req, 'catalogue', product ? `Edit ${product.name}` : 'Add Product'),
    product,
    values,
    error,
    photoLost,
    categories: catalogService.categories(),
    imageUrl: product ? catalogService.toView(product).image : '',
  });
}

router.get('/catalogue/new', async (req, res, next) => {
  try {
    await catalogService.ensureImported(req.session.adminUserId);
    const products = await catalogService.listForAdmin();
    const nextOrder = products.reduce((max, p) => Math.max(max, p.displayOrder), 0) + 10;
    renderProductForm(req, res, { product: null, values: { isActive: true, displayOrder: nextOrder } });
  } catch (err) {
    next(err);
  }
});

router.post('/catalogue/new', upload.single('photo'), async (req, res) => {
  try {
    await catalogService.createProduct(req.body, photoFrom(req), req.session.adminUserId);
    res.redirect(withNotice('/admin/catalogue', { saved: 'Product added to the catalogue.' }));
  } catch (err) {
    renderProductForm(req, res, { product: null, values: { ...req.body, isActive: req.body.isActive === 'on' }, error: friendly(err) });
  }
});

router.get('/catalogue/:id', async (req, res, next) => {
  try {
    const product = await catalogService.getProduct(req.params.id);
    if (!product) return res.redirect(withNotice('/admin/catalogue', { error: 'Product not found.' }));
    renderProductForm(req, res, { product, values: product });
  } catch (err) {
    next(err);
  }
});

router.post('/catalogue/:id', upload.single('photo'), async (req, res, next) => {
  try {
    await catalogService.updateProduct(req.params.id, req.body, photoFrom(req), req.session.adminUserId);
    res.redirect(withNotice('/admin/catalogue', { saved: 'Product saved.' }));
  } catch (err) {
    try {
      const product = await catalogService.getProduct(req.params.id);
      if (!product) return res.redirect(withNotice('/admin/catalogue', { error: 'Product not found.' }));
      renderProductForm(req, res, { product, values: { ...req.body, isActive: req.body.isActive === 'on' }, error: friendly(err) });
    } catch (inner) {
      next(inner);
    }
  }
});

router.post('/catalogue/:id/visibility', async (req, res) => {
  try {
    const show = req.body.show === '1';
    await catalogService.setActive(req.params.id, show);
    res.redirect(withNotice('/admin/catalogue', { saved: show ? 'Product is now shown on the website.' : 'Product hidden from the website.' }));
  } catch (err) {
    res.redirect(withNotice('/admin/catalogue', { error: friendly(err) }));
  }
});

router.post('/catalogue/:id/delete', async (req, res) => {
  try {
    await catalogService.deleteProduct(req.params.id);
    res.redirect(withNotice('/admin/catalogue', { saved: 'Product deleted.' }));
  } catch (err) {
    res.redirect(withNotice('/admin/catalogue', { error: friendly(err) }));
  }
});

router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (maximum 25MB).' : `Upload failed: ${err.message}`;
    const back = req.path.startsWith('/catalogue') ? '/admin/catalogue' : '/admin/website-photos';
    return res.redirect(withNotice(back, { error: msg }));
  }
  next(err);
});

module.exports = router;
