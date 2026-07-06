// backend/routes/interactionRoutes.js
//
// Suivi des prises de contact (interactions) — leads ET clients.
const express = require('express');
const router = express.Router();
const interactionController = require('../controllers/interactionController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/interactions/followups - relances dues/en retard non faites (vue "À relancer")
router.get('/followups', interactionController.getFollowups);

// GET /api/interactions/cockpit - cockpit "Suivi" (1 ligne par contact, filtrable)
router.get('/cockpit', interactionController.getCockpit);

// GET /api/interactions/outreach-summary - dernier statut outreach par lead/canal
router.get('/outreach-summary', interactionController.getOutreachSummary);

// GET /api/interactions/contact/:contactType/:contactId - timeline d'un contact
router.get('/contact/:contactType/:contactId', interactionController.getByContact);

// POST /api/interactions - créer une interaction
router.post('/', interactionController.create);

// PATCH /api/interactions/contact-status - changer le statut d'un contact (Pas de business, réactivation)
router.patch('/contact-status', interactionController.setContactStatus);

// PATCH /api/interactions/:id/followup-done - marquer la relance comme faite
router.patch('/:id/followup-done', interactionController.markFollowupDone);

// DELETE /api/interactions/:id - supprimer
router.delete('/:id', interactionController.remove);

module.exports = router;
