// backend/routes/activitiesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const activityModel = require('../models/activityModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Récupérer les activités récentes (doit être avant /:id pour éviter les conflits de route)
router.get('/recent', async (req, res) => {
  const db = req.app.locals.db;
  const limit = parseInt(req.query.limit) || 5;

  try {
    const activities = await activityModel.getRecentActivities(db, limit);
    res.json(activities);
  } catch (error) {
    console.error('Erreur lors de la récupération des activités récentes:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer toutes les activités
router.get('/', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const activities = await activityModel.getAllActivities(db);
    res.json(activities);
  } catch (error) {
    console.error('Erreur lors de la récupération des activités:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer une activité spécifique
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const activity = await activityModel.getActivityById(db, id);

    if (!activity) {
      return res.status(404).json({ message: 'Activité non trouvée' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'activité:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer une nouvelle activité
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const {
    type,
    description,
    planned_time,
    actual_time,
    date,
    priority,
    status,
    project_id,
    lead_id
  } = req.body;

  if (!type || !description || !date) {
    return res.status(400).json({ message: 'Type, description et date sont requis' });
  }

  try {
    const activity = await activityModel.createActivity(db, {
      type,
      description,
      planned_time,
      actual_time,
      date,
      priority,
      status,
      project_id,
      lead_id
    });

    res.status(201).json(activity);
  } catch (error) {
    console.error('Erreur lors de la création de l\'activité:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour une activité
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const {
    type,
    description,
    planned_time,
    actual_time,
    date,
    priority,
    status,
    project_id,
    lead_id
  } = req.body;

  try {
    const updatedActivity = await activityModel.updateActivity(db, id, {
      type,
      description,
      planned_time,
      actual_time,
      date,
      priority,
      status,
      project_id,
      lead_id
    });

    res.json(updatedActivity);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'activité:', error);

    if (error.message === 'Activité non trouvée') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer une activité comme terminée
router.patch('/:id/complete', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { actual_time } = req.body;

  try {
    const completedActivity = await activityModel.completeActivity(db, id, actual_time);
    res.json(completedActivity);
  } catch (error) {
    console.error('Erreur lors de la complétion de l\'activité:', error);

    if (error.message === 'Activité non trouvée') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer une activité
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    await activityModel.deleteActivity(db, id);
    res.json({ message: 'Activité supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'activité:', error);

    if (error.message === 'Activité non trouvée') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
