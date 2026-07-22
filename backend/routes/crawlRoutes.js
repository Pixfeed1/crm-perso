// backend/routes/crawlRoutes.js
// Pilotage du crawl externe (cc_prospector) — monté sous /api/portefeuille/crawl.
const express = require('express');
const router = express.Router();
const crawlController = require('../controllers/crawlController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/portefeuille/crawl/exclude.txt - domaines déjà connus (crawl_results + leads),
// à passer à cc_prospector via --exclude pour ne jamais re-sortir un domaine traité.
router.get('/exclude.txt', crawlController.exportExclude);

// GET /api/portefeuille/crawl - historique des crawls
router.get('/', crawlController.list);

// POST /api/portefeuille/crawl - lance un crawl
router.post('/', crawlController.start);

// GET /api/portefeuille/crawl/:id - statut + phase + progression + résultats
router.get('/:id', crawlController.get);

// GET /api/portefeuille/crawl/:id/export.csv - CSV nettoyé
router.get('/:id/export.csv', crawlController.exportCsv);

// POST /api/portefeuille/crawl/:id/enrich - enrichissement SIRENE des résultats sélectionnés
router.post('/:id/enrich', crawlController.enrichResults);

// POST /api/portefeuille/crawl/:id/to-prospect - convertit des résultats en prospects
router.post('/:id/to-prospect', crawlController.toProspect);

// DELETE /api/portefeuille/crawl/:id - supprime le job + ses résultats
router.delete('/:id', crawlController.remove);

module.exports = router;
