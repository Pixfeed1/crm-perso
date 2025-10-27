// backend/routes/quoteRoutes.js
const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');

/**
 * Routes pour la gestion des devis
 */

// GET /api/quotes - Récupérer tous les devis
router.get('/', quoteController.getAllQuotes);

// GET /api/quotes/:id - Récupérer un devis spécifique
router.get('/:id', quoteController.getQuoteById);

// POST /api/quotes - Créer un nouveau devis
router.post('/', quoteController.createQuote);

// PUT /api/quotes/:id - Mettre à jour un devis
router.put('/:id', quoteController.updateQuote);

// PATCH /api/quotes/:id/status - Changer le statut d'un devis
router.patch('/:id/status', quoteController.updateQuoteStatus);

// POST /api/quotes/:id/send - Envoyer un devis par email
router.post('/:id/send', quoteController.sendQuote);

// POST /api/quotes/:id/sign - Signer un devis
router.post('/:id/sign', quoteController.signQuote);

// DELETE /api/quotes/:id - Supprimer un devis
router.delete('/:id', quoteController.deleteQuote);

module.exports = router;
