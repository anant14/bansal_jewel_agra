'use strict';

const express = require('express');
const prisma = require('../../db/prisma');
const content = require('../../services/content');
const rateService = require('../../services/rateService');
const { startOfTodayIST } = require('../../utils/istDate');
const NAV = require('./nav');

const router = express.Router();

router.get('/rates', async (req, res, next) => {
  try {
    const currentRates = await rateService.getCurrentRates();

    const historyFilters = {
      from: req.query.from || '',
      to: req.query.to || '',
      metal: req.query.metal || '',
      rateTypeCode: req.query.rateType || '',
    };
    const historyPage = Math.max(1, parseInt(req.query.historyPage, 10) || 1);
    const history = await rateService.getRateHistory({
      from: historyFilters.from || undefined,
      to: historyFilters.to || undefined,
      metal: historyFilters.metal || undefined,
      rateTypeCode: historyFilters.rateTypeCode || undefined,
      page: historyPage,
      pageSize: 20,
    });

    const requestFilters = {
      range: req.query.range || '7d',
      source: req.query.reqSource || '',
      status: req.query.reqStatus || '',
    };
    const requestPage = Math.max(1, parseInt(req.query.requestPage, 10) || 1);
    const requestsResult = await listRateRequests({ ...requestFilters, page: requestPage, pageSize: 20 });

    const today = startOfTodayIST();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const [todayRequests, websiteRequests, botRequests, successfulSends, marketingOptIns] = await Promise.all([
      prisma.rateRequest.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.rateRequest.count({ where: { createdAt: { gte: today, lt: tomorrow }, source: 'website' } }),
      prisma.rateRequest.count({ where: { createdAt: { gte: today, lt: tomorrow }, source: 'whatsapp_bot' } }),
      prisma.rateRequest.count({ where: { createdAt: { gte: today, lt: tomorrow }, deliveryStatus: 'sent' } }),
      prisma.rateRequest.count({ where: { createdAt: { gte: today, lt: tomorrow }, marketingOptIn: true } }),
    ]);

    const allRateTypes = await rateService.getRateTypes({ activeOnly: false });

    res.render('admin/rates', {
      page: { title: 'Gold & Silver Rates — Admin' },
      brand: content.brand,
      nav: NAV,
      activeKey: 'rates',
      adminName: req.session.adminName,
      currentRates,
      history,
      historyFilters,
      requestsResult,
      requestFilters,
      allRateTypes,
      metrics: { todayRequests, websiteRequests, botRequests, successfulSends, marketingOptIns },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/rates/update', async (req, res, next) => {
  try {
    const entries = Object.keys(req.body)
      .filter((key) => key.startsWith('rate_'))
      .map((key) => ({ code: key.replace('rate_', ''), value: req.body[key] }))
      .filter((e) => String(e.value || '').trim() !== '');

    await rateService.saveRates(entries, req.session.adminUserId);
    res.redirect('/admin/rates');
  } catch (err) {
    if (err.message && err.message.includes('positive number')) {
      return res.status(400).send(err.message + ' <a href="/admin/rates">Go back</a>');
    }
    next(err);
  }
});

async function listRateRequests({ range, source, status, page, pageSize }) {
  const where = {};
  if (source) where.source = source;
  if (status) where.deliveryStatus = status;

  if (range && range !== 'all') {
    const now = new Date();
    let from;
    if (range === 'today') from = startOfTodayIST();
    else if (range === '7d') from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (range === '30d') from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (from) where.createdAt = { gte: from };
  }

  const [total, requests] = await Promise.all([
    prisma.rateRequest.count({ where }),
    prisma.rateRequest.findMany({
      where,
      include: { contact: { select: { id: true, name: true, whatsappNumber: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { requests, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

module.exports = router;
