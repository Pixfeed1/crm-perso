// backend/routes/interventionRoutes.js
const express = require('express');
const router = express.Router();
const interventionController = require('../controllers/interventionController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentification requise pour toutes les routes
router.use(authMiddleware);

// Routes pour les interventions d'un projet
router.get('/project/:projectId', interventionController.getInterventionsByProject);
router.get('/project/:projectId/stats', interventionController.getInterventionStats);
router.post('/project/:projectId', interventionController.createIntervention);

// Routes pour une intervention spécifique
router.get('/:id', interventionController.getInterventionById);
router.put('/:id', interventionController.updateIntervention);
router.delete('/:id', interventionController.deleteIntervention);

module.exports = router;
