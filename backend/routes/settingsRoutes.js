// backend/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const settingsController = require('../controllers/settingsController');

/**
 * Routes pour les paramètres de l'entreprise
 * Toutes les routes nécessitent une authentification
 */

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// GET /api/settings - Récupérer les paramètres
router.get('/', settingsController.getSettings);

// PUT /api/settings - Mettre à jour les paramètres
router.put('/', settingsController.updateSettings);

// POST /api/settings/logo - Mettre à jour le logo
router.post('/logo', settingsController.updateLogo);

// POST /api/settings/test-email - Tester la configuration email
router.post('/test-email', settingsController.testEmailConfig);

module.exports = router;
