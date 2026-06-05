// backend/routes/maintenancePayRoutes.js
//
// Route PUBLIQUE (sans authMiddleware) du lien court de paiement de maintenance.
// Doit être montée AVANT le catch-all SPA React pour ne pas être interceptée.
const express = require('express');
const router = express.Router();
const contractController = require('../controllers/maintenanceContractController');

// GET /pay/:token - crée une session Stripe fraîche et redirige (302) vers Stripe Checkout
router.get('/:token', contractController.payRedirect);

module.exports = router;
