// backend/routes/maintenanceBillingRoutes.js
//
// Route webhook Stripe (publique, serveur-à-serveur). PAS d'authMiddleware.
// Le corps doit rester BRUT (express.raw) pour la vérification de signature Stripe,
// d'où le montage de ce routeur AVANT le express.json() global dans server.js.

const express = require('express');
const router = express.Router();
const maintenanceBillingController = require('../controllers/maintenanceBillingController');

// POST /api/maintenance-billing/stripe-webhook
router.post(
  '/stripe-webhook',
  express.raw({ type: 'application/json' }),
  maintenanceBillingController.handleStripeWebhook
);

module.exports = router;
