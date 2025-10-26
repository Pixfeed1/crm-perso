// backend/routes/paymentMethodRoutes.js
const express = require('express');
const router = express.Router();
const paymentMethodController = require('../controllers/paymentMethodController');

// GET /api/payment-methods - Récupérer tous les moyens de paiement
router.get('/', paymentMethodController.getAll);

// GET /api/payment-methods/:code - Récupérer un moyen par code
router.get('/:code', paymentMethodController.getByCode);

module.exports = router;
