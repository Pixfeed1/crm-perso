// backend/routes/goalsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const goalModel = require('../models/goalModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les objectifs
router.get('/', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const goals = await goalModel.getAllGoals(db);
    res.json(goals);
  } catch (error) {
    console.error('Erreur lors de la récupération des objectifs:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un objectif spécifique avec ses étapes
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const goal = await goalModel.getGoalById(db, id);

    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    res.json(goal);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un nouvel objectif
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const {
    name,
    description,
    target_value,
    current_value,
    category,
    period,
    start_date,
    end_date
  } = req.body;

  if (!name || !target_value || !category || !period || !start_date || !end_date) {
    return res.status(400).json({
      message: 'Nom, valeur cible, catégorie, période, date de début et date de fin sont requis'
    });
  }

  try {
    const goal = await goalModel.createGoal(db, {
      name,
      description,
      target_value,
      current_value,
      category,
      period,
      start_date,
      end_date
    });

    res.status(201).json(goal);
  } catch (error) {
    console.error('Erreur lors de la création de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour uniquement la progression d'un objectif
router.patch('/:id/progress', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { current_value } = req.body;

  console.log(`[GoalsRoutes] Mise à jour de la progression de l'objectif ID ${id} à ${current_value}`);

  if (current_value === undefined) {
    return res.status(400).json({ message: 'Valeur actuelle requise' });
  }

  try {
    // Vérifier si l'objectif existe
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const updatedGoal = await goalModel.updateGoalProgress(db, id, current_value);
    res.json(updatedGoal);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la progression:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un objectif existant
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const updateData = req.body;

  console.log(`[GoalsRoutes] Tentative de mise à jour de l'objectif ID ${id}:`, updateData);

  try {
    // Vérifier si l'objectif existe
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const updatedGoal = await goalModel.updateGoal(db, id, updateData);
    res.json(updatedGoal);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un objectif
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // Vérifier si l'objectif existe
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    await goalModel.deleteGoal(db, id);
    res.json({ message: 'Objectif supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir les étapes d'un objectif
router.get('/:id/milestones', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // Vérifier si l'objectif existe
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const milestones = await goalModel.getGoalMilestones(db, id);
    res.json(milestones);
  } catch (error) {
    console.error('Erreur lors de la récupération des étapes:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Ajouter une étape à un objectif
router.post('/:id/milestones', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { name, target } = req.body;

  if (!name || target === undefined) {
    return res.status(400).json({ message: 'Nom et valeur cible sont requis' });
  }

  try {
    // Vérifier si l'objectif existe
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const milestone = await goalModel.createMilestone(db, id, { name, target });
    res.status(201).json(milestone);
  } catch (error) {
    console.error('Erreur lors de la création de l\'étape:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour une étape
router.put('/:goalId/milestones/:milestoneId', async (req, res) => {
  const db = req.app.locals.db;
  const { goalId, milestoneId } = req.params;
  const { name, target, achieved } = req.body;

  try {
    // Vérifier si l'étape existe et appartient à l'objectif
    const existingMilestone = await goalModel.checkMilestoneExists(db, milestoneId, goalId);
    if (!existingMilestone) {
      return res.status(404).json({ message: 'Étape non trouvée' });
    }

    const updatedMilestone = await goalModel.updateMilestone(db, milestoneId, goalId, {
      name,
      target,
      achieved
    });

    res.json(updatedMilestone);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'étape:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer une étape
router.delete('/:goalId/milestones/:milestoneId', async (req, res) => {
  const db = req.app.locals.db;
  const { goalId, milestoneId } = req.params;

  try {
    // Vérifier si l'étape existe et appartient à l'objectif
    const existingMilestone = await goalModel.checkMilestoneExists(db, milestoneId, goalId);
    if (!existingMilestone) {
      return res.status(404).json({ message: 'Étape non trouvée' });
    }

    await goalModel.deleteMilestone(db, milestoneId, goalId);
    res.json({ message: 'Étape supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'étape:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les objectifs archivés
router.get('/archived/list', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const archivedGoals = await goalModel.getArchivedGoals(db);
    res.json(archivedGoals);
  } catch (error) {
    console.error('Erreur lors de la récupération des objectifs archivés:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Archiver un objectif
router.patch('/:id/archive', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const archivedGoal = await goalModel.archiveGoal(db, id);
    res.json(archivedGoal);
  } catch (error) {
    console.error('Erreur lors de l\'archivage de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Désarchiver un objectif
router.patch('/:id/unarchive', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const unarchivedGoal = await goalModel.unarchiveGoal(db, id);
    res.json(unarchivedGoal);
  } catch (error) {
    console.error('Erreur lors du désarchivage de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer un objectif comme terminé
router.patch('/:id/complete', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const completedGoal = await goalModel.completeGoal(db, id);
    res.json(completedGoal);
  } catch (error) {
    console.error('Erreur lors de la completion de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Dupliquer un objectif
router.post('/:id/duplicate', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { start_date, end_date } = req.body;

  try {
    const existingGoal = await goalModel.getGoalById(db, id);
    if (!existingGoal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }

    const duplicatedGoal = await goalModel.duplicateGoal(db, id, { start_date, end_date });
    res.status(201).json(duplicatedGoal);
  } catch (error) {
    console.error('Erreur lors de la duplication de l\'objectif:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
