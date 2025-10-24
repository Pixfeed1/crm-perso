// backend/routes/goalsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const goalModel = require('../models/goalModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les objectifs
router.get('/', async (req, res) => {
  try {
    const goals = await goalModel.getAllGoals();
    res.json(goals);
  } catch (error) {
    console.error('Erreur lors de la récupération des objectifs:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Obtenir un objectif spécifique avec ses étapes
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const goal = await goalModel.getGoalById(id);

    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    res.json(goal);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'objectif:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Créer un nouvel objectif
router.post('/', async (req, res) => {
  try {
    const goal = await goalModel.createGoal(req.body);
    res.status(201).json(goal);
  } catch (error) {
    console.error('Erreur lors de la création de l\'objectif:', error);
    if (error.message.includes('requis')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour uniquement la progression d'un objectif
router.patch('/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    const { current_value } = req.body;

    console.log(`[GoalsRoutes] Mise à jour de la progression de l'objectif ID ${id} à ${current_value}`);

    if (current_value === undefined) {
      return res.status(400).json({ message: 'Valeur actuelle requise' });
    }

    const goal = await goalModel.updateProgress(id, current_value);
    res.json(goal);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la progression:', error);
    if (error.message === 'Objectif non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour un objectif
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const goal = await goalModel.updateGoal(id, req.body);
    res.json(goal);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'objectif:', error);
    if (error.message === 'Objectif non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Supprimer un objectif
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await goalModel.deleteGoal(id);
    res.json({ message: 'Objectif supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'objectif:', error);
    if (error.message === 'Objectif non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// ==================== Routes pour les milestones ====================

// Obtenir les étapes d'un objectif
router.get('/:id/milestones', async (req, res) => {
  try {
    const { id } = req.params;
    const milestones = await goalModel.getMilestones(id);
    res.json(milestones);
  } catch (error) {
    console.error('Erreur lors de la récupération des étapes:', error);
    if (error.message === 'Objectif non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Ajouter une étape à un objectif
router.post('/:id/milestones', async (req, res) => {
  try {
    const { id } = req.params;
    const milestone = await goalModel.addMilestone(id, req.body);
    res.status(201).json(milestone);
  } catch (error) {
    console.error('Erreur lors de la création de l\'étape:', error);
    if (error.message.includes('requis') || error.message === 'Objectif non trouvé') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour une étape
router.put('/:goalId/milestones/:milestoneId', async (req, res) => {
  try {
    const { goalId, milestoneId } = req.params;
    const milestone = await goalModel.updateMilestone(goalId, milestoneId, req.body);
    res.json(milestone);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'étape:', error);
    if (error.message === 'Étape non trouvée') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Supprimer une étape
router.delete('/:goalId/milestones/:milestoneId', async (req, res) => {
  try {
    const { goalId, milestoneId } = req.params;
    await goalModel.deleteMilestone(goalId, milestoneId);
    res.json({ message: 'Étape supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'étape:', error);
    if (error.message === 'Étape non trouvée') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
