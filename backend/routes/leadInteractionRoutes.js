// backend/routes/leadInteractionRoutes.js

const express = require('express');
const router = express.Router();
const leadInteractionController = require('../controllers/leadInteractionController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentification requise pour toutes les routes
router.use(authMiddleware);

// Routes pour les interactions des leads
// Toutes les routes sont préfixées par /api/leads/:leadId/interactions

/**
 * GET /api/leads/:leadId/interactions
 * Récupérer toutes les interactions d'un lead
 */
router.get('/:leadId/interactions', leadInteractionController.getInteractionsByLeadId);

/**
 * POST /api/leads/:leadId/interactions
 * Créer une nouvelle interaction pour un lead
 */
router.post('/:leadId/interactions', leadInteractionController.createInteraction);

/**
 * GET /api/interactions/:interactionId
 * Récupérer une interaction spécifique
 */
router.get('/interactions/:interactionId', leadInteractionController.getInteractionById);

/**
 * PUT /api/interactions/:interactionId
 * Mettre à jour une interaction
 */
router.put('/interactions/:interactionId', leadInteractionController.updateInteraction);

/**
 * DELETE /api/interactions/:interactionId
 * Supprimer une interaction
 */
router.delete('/interactions/:interactionId', leadInteractionController.deleteInteraction);

module.exports = router;
