// backend/routes/scheduledEmailRoutes.js

const express = require('express');
const router = express.Router();
const scheduledEmailController = require('../controllers/scheduledEmailController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentification requise pour toutes les routes
router.use(authMiddleware);

/**
 * ROUTES DES EMAILS PROGRAMMÉS
 *
 * Base: /api/scheduled-emails
 */

// Statistiques et liste
router.get('/stats', scheduledEmailController.getStats);
router.get('/upcoming', scheduledEmailController.getUpcoming);
router.get('/', scheduledEmailController.getAllScheduledEmails);

// CRUD sur un email
router.post('/', scheduledEmailController.createScheduledEmail);
router.get('/:id', scheduledEmailController.getScheduledEmailById);
router.put('/:id', scheduledEmailController.updateScheduledEmail);
router.delete('/:id', scheduledEmailController.deleteScheduledEmail);

// Actions spéciales
router.post('/:id/cancel', scheduledEmailController.cancelScheduledEmail);

// Par élément lié
router.get('/related/:type/:id', scheduledEmailController.getByRelated);

module.exports = router;
