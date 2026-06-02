// backend/routes/exportRoutes.js

const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentification requise pour toutes les routes
router.use(authMiddleware);

// Routes d'export par entité
router.get('/leads', exportController.exportLeads);
router.get('/projects', exportController.exportProjects);
router.get('/goals', exportController.exportGoals);
router.get('/revenues', exportController.exportRevenues);
router.get('/activities', exportController.exportActivities);
router.get('/contacts', exportController.exportContacts);
router.get('/clients', exportController.exportClients);

// Export complet
router.get('/all', exportController.exportAll);

module.exports = router;
