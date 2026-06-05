// backend/routes/subscriptionRoutes.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentification requise pour toutes les routes
router.use(authMiddleware);

// GET /api/subscriptions - liste des abonnements
router.get('/', subscriptionController.getAllSubscriptions);

// POST /api/subscriptions - créer un abonnement
router.post('/', subscriptionController.createSubscription);

// POST /api/subscriptions/:id/billing/checkout - lien court de paiement (pay.pixfeed.net/{token})
router.post('/:id/billing/checkout', subscriptionController.createBillingCheckout);

// POST /api/subscriptions/:id/billing/send-link - envoyer le lien au client par email
router.post('/:id/billing/send-link', subscriptionController.sendBillingLink);

// POST /api/subscriptions/:id/billing/cancel - résilier (body { immediate? })
router.post('/:id/billing/cancel', subscriptionController.cancelBilling);

// POST /api/subscriptions/:id/billing/resume - réactiver
router.post('/:id/billing/resume', subscriptionController.resumeBilling);

// DELETE /api/subscriptions/:id - supprimer
router.delete('/:id', subscriptionController.deleteSubscription);

module.exports = router;
