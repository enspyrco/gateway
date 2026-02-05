const { getSession } = require('../services/accounts');

/**
 * Middleware to validate session from X-Session-Id header
 * Adds session info to req.session
 */
function requireSession(req, res, next) {
  const sessionId = req.headers['x-session-id'];

  if (!sessionId) {
    return res.status(401).json({
      success: false,
      error: 'Missing X-Session-Id header',
    });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session',
    });
  }

  // Attach session to request
  req.session = session;
  req.sessionId = sessionId;

  next();
}

module.exports = { requireSession };
