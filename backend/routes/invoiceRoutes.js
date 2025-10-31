// backend/routes/invoiceRoutes.js
const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

/**
 * Routes pour la gestion des factures
 */

// GET /api/invoices/unpaid - Récupérer les factures impayées
router.get('/unpaid', invoiceController.getUnpaidInvoices);

// GET /api/invoices - Récupérer toutes les factures
router.get('/', invoiceController.getAllInvoices);

// GET /api/invoices/:id - Récupérer une facture spécifique
router.get('/:id', invoiceController.getInvoiceById);

// POST /api/invoices - Créer une nouvelle facture
router.post('/', invoiceController.createInvoice);

// POST /api/invoices/from-quote/:quoteId - Créer une facture à partir d'un devis
router.post('/from-quote/:quoteId', invoiceController.createInvoiceFromQuote);

// PUT /api/invoices/:id - Mettre à jour une facture
router.put('/:id', invoiceController.updateInvoice);

// PATCH /api/invoices/:id/paid - Marquer une facture comme payée
router.patch('/:id/paid', invoiceController.markAsPaid);

// PATCH /api/invoices/:id/payment-status - Mettre à jour le statut de paiement
router.patch('/:id/payment-status', invoiceController.updatePaymentStatus);

// POST /api/invoices/:id/send - Envoyer une facture par email
router.post('/:id/send', invoiceController.sendInvoice);

// DELETE /api/invoices/:id - Supprimer une facture
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router;
