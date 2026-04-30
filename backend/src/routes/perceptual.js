/**
 * Perceptual Matching API routes (stub)
 * POST /api/perceptual/match - Match an image against registered hashes
 */

const express = require('express');

function createRouter(upload) {
  const router = express.Router();

  router.post('/match', upload.single('image'), async (req, res) => {
    res.json({ matches: [] });
  });

  return router;
}

module.exports = createRouter;
