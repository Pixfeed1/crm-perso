// backend/routes/reviewRequestRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const reviewRequestController = require('../controllers/reviewRequestController');

/**
 * Routes pour les demandes d'avis clients
 * Toutes les routes nécessitent une authentification
 */

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// POST /api/review-requests - Envoyer une demande d'avis
router.post('/', reviewRequestController.sendReviewRequest);

// GET /api/review-requests - Récupérer toutes les demandes d'avis
router.get('/', reviewRequestController.getAllReviewRequests);

// GET /api/review-requests/client/:clientId - Récupérer les demandes d'un client
router.get('/client/:clientId', reviewRequestController.getClientReviewRequests);

// GET /api/review-requests/template - Obtenir le template par défaut
router.get('/template', reviewRequestController.getDefaultTemplate);

// GET /api/review-requests/stats - Obtenir les statistiques
router.get('/stats', reviewRequestController.getReviewStats);

module.exports = router;
