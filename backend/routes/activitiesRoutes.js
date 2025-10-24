// backend/routes/activitiesRoutes.js

const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Route GET pour récupérer toutes les activités
router.get('/', activityController.getAllActivities);

// Route GET pour récupérer les activités récentes (pour le tableau de bord)
router.get('/recent', activityController.getRecentActivities);

// Route GET pour récupérer une activité spécifique
router.get('/:id', activityController.getActivityById);

// Route POST pour créer une nouvelle activité
router.post('/', activityController.createActivity);

// Route PUT pour mettre à jour une activité existante
router.put('/:id', activityController.updateActivity);

// Route PATCH pour marquer une activité comme terminée
router.patch('/:id/complete', activityController.completeActivity);

// Route DELETE pour supprimer une activité
router.delete('/:id', activityController.deleteActivity);

module.exports = router;