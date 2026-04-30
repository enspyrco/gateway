/**
 * require-admin.js — Admin role guard middleware.
 *
 * Reads ADMIN_WALLETS from the environment (comma-separated lowercase addresses).
 * Must be used after requireAuth so req.actor is populated.
 */

const ADMIN_WALLETS = new Set(
  (process.env.ADMIN_WALLETS || '').toLowerCase().split(',').filter(Boolean)
);

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAdmin(req, res, next) {
  if (!req.actor) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  }
  if (!ADMIN_WALLETS.has(req.actor.address)) {
    return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
  }
  next();
}

module.exports = requireAdmin;
