// backend/routes/crawlRoutes.js
// Pilotage du crawl externe (cc_prospector) — monté sous /api/portefeuille/crawl.
const express = require('express');
const router = express.Router();
const crawlController = require('../controllers/crawlController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// POST /api/portefeuille/crawl - lance un crawl
router.post('/', crawlController.start);

// GET /api/portefeuille/crawl/:id - statut + phase + progression + résultats
router.get('/:id', crawlController.get);

// GET /api/portefeuille/crawl/:id/export.csv - CSV nettoyé
router.get('/:id/export.csv', crawlController.exportCsv);

// POST /api/portefeuille/crawl/:id/to-prospect - convertit des résultats en prospects
router.post('/:id/to-prospect', crawlController.toProspect);

module.exports = router;
