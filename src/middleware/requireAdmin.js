'use strict';

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminUserId) return next();
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/admin/login');
}

module.exports = requireAdmin;
