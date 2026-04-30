/**
 * Request ID Middleware
 *
 * Generates a unique ID for each request, attaches it to req.id,
 * and sets the X-Request-Id response header for correlation.
 */

const { v4: uuidv4 } = require('uuid');

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
