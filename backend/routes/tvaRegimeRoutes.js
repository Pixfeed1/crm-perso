// backend/routes/tvaRegimeRoutes.js
const express = require('express');
const router = express.Router();
const tvaRegimeController = require('../controllers/tvaRegimeController');

// GET /api/tva-regimes - Récupérer tous les régimes TVA
router.get('/', tvaRegimeController.getAll);

// GET /api/tva-regimes/:code - Récupérer un régime par code
router.get('/:code', tvaRegimeController.getByCode);

module.exports = router;
