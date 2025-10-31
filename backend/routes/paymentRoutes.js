// backend/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

// Toutes les routes nécessitent une authentification
router.use(authMiddleware);

// Routes pour les paiements
router.get('/', paymentController.getAllPayments);
router.get('/stats/treasury', paymentController.getTreasuryStats);
router.get('/stats/chart', paymentController.getPaymentsForChart);
router.get('/invoice/:invoiceId', paymentController.getPaymentsByInvoice);
router.get('/client/:clientId', paymentController.getPaymentsByClient);
router.get('/:id', paymentController.getPaymentById);
router.post('/', paymentController.createPayment);
router.put('/:id', paymentController.updatePayment);
router.delete('/:id', paymentController.deletePayment);

module.exports = router;
