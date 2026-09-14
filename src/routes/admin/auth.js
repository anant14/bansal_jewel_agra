'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../db/prisma');
const logger = require('../../utils/logger');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.adminUserId) return res.redirect('/admin');
  res.render('admin/login', {
    page: { title: 'Admin Login — Bansal Jewellers' },
    error: null,
  });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const renderError = (message, status) =>
    res.status(status || 401).render('admin/login', {
      page: { title: 'Admin Login — Bansal Jewellers' },
      error: message,
    });

  if (!email || !password) return renderError('Enter your email and password.', 400);

  try {
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user || !user.isActive) return renderError('Invalid email or password.');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return renderError('Invalid email or password.');

    req.session.regenerate((err) => {
      if (err) {
        logger.error('admin login: session regenerate failed', err.message);
        return renderError('Something went wrong. Please try again.', 500);
      }
      req.session.adminUserId = user.id;
      req.session.adminName = user.name;
      res.redirect('/admin');
    });
  } catch (err) {
    logger.error('admin login: failed', err.message);
    renderError('Something went wrong. Please try again.', 500);
  }
});

router.post('/logout', (req, res) => {
  if (!req.session) return res.redirect('/admin/login');
  req.session.destroy(() => {
    res.clearCookie('bj_admin_sid');
    res.redirect('/admin/login');
  });
});

module.exports = router;
