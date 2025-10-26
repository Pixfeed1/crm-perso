// backend/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

/**
 * Routes pour les paramètres de l'entreprise
 */

// GET /api/settings - Récupérer les paramètres
router.get('/', settingsController.getSettings);

// PUT /api/settings - Mettre à jour les paramètres
router.put('/', settingsController.updateSettings);

// POST /api/settings/logo - Mettre à jour le logo
router.post('/logo', settingsController.updateLogo);

module.exports = router;
