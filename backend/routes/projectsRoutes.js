// backend/routes/projectsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const projectModel = require('../models/projectModel');
const projectPaymentModel = require('../models/projectPaymentModel');
const revenueModel = require('../models/revenueModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les projets
router.get('/', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const projects = await projectModel.getAllProjects(db);
    res.json(projects);
  } catch (error) {
    console.error('Erreur lors de la récupération des projets:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un projet spécifique
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const project = await projectModel.getProjectById(db, id);

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    res.json(project);
  } catch (error) {
    console.error('Erreur lors de la récupération du projet:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un nouveau projet
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const { name, type, description, start_date, end_date, status, amount, lead_id } = req.body;

  if (!name || !type || !status) {
    return res.status(400).json({ message: 'Nom, type et statut sont requis' });
  }

  try {
    const project = await projectModel.createProject(db, {
      name,
      type,
      description,
      start_date,
      end_date,
      status,
      amount,
      lead_id
    });

    res.status(201).json(project);
  } catch (error) {
    console.error('Erreur lors de la création du projet:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un projet
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { name, type, description, start_date, end_date, status, amount, lead_id } = req.body;

  try {
    const updatedProject = await projectModel.updateProject(db, id, {
      name,
      type,
      description,
      start_date,
      end_date,
      status,
      amount,
      lead_id
    });

    res.json(updatedProject);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du projet:', error);

    if (error.message === 'Projet non trouvé') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un projet
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    await projectModel.deleteProject(db, id);
    res.json({ message: 'Projet supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du projet:', error);

    if (error.message === 'Projet non trouvé') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Ajouter une tâche à un projet
router.post('/:id/tasks', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { title, description, deadline, completed } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Titre de la tâche requis' });
  }

  try {
    const task = await projectModel.addTask(db, id, {
      title,
      description,
      deadline,
      completed
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Erreur lors de la création de la tâche:', error);

    if (error.message === 'Projet non trouvé') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour une tâche
router.put('/:projectId/tasks/:taskId', async (req, res) => {
  const db = req.app.locals.db;
  const { projectId, taskId } = req.params;
  const { title, description, deadline, completed } = req.body;

  try {
    const updatedTask = await projectModel.updateTask(db, projectId, taskId, {
      title,
      description,
      deadline,
      completed
    });

    res.json(updatedTask);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la tâche:', error);

    if (error.message === 'Tâche non trouvée') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer une tâche
router.delete('/:projectId/tasks/:taskId', async (req, res) => {
  const db = req.app.locals.db;
  const { projectId, taskId } = req.params;

  try {
    await projectModel.deleteTask(db, projectId, taskId);
    res.json({ message: 'Tâche supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la tâche:', error);

    if (error.message === 'Tâche non trouvée') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ==================== ROUTES PAIEMENTS DE PROJETS ====================

// Obtenir tous les paiements d'un projet
router.get('/:id/payments', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const payments = await projectPaymentModel.getProjectPayments(db, id);
    res.json(payments);
  } catch (error) {
    console.error('Erreur lors de la récupération des paiements:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir le total des paiements d'un projet
router.get('/:id/payments/total', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const total = await projectPaymentModel.getProjectPaymentsTotal(db, id);
    res.json({ total });
  } catch (error) {
    console.error('Erreur lors du calcul du total des paiements:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Ajouter un paiement à un projet
router.post('/:id/payments', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { amount, payment_date, payment_method, reference, notes } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: 'Le montant doit être supérieur à 0' });
  }

  try {
    // Vérifier que le projet existe
    const project = await projectModel.getProjectById(db, id);
    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Créer automatiquement un revenu lié au paiement
    let revenueId = null;
    try {
      const revenue = await revenueModel.createRevenue(db, {
        amount: amount,
        date: payment_date || new Date().toISOString().split('T')[0],
        description: `Paiement pour le projet: ${project.name}`,
        project_id: id,
        type: 'invoice',
        status: 'paid'
      });
      revenueId = revenue.id;
      console.log('[ProjectPayment] Revenu créé automatiquement:', revenueId);
    } catch (revenueError) {
      console.error('[ProjectPayment] Erreur lors de la création du revenu:', revenueError);
      // Continuer même si la création du revenu échoue
    }

    // Créer le paiement
    const payment = await projectPaymentModel.createProjectPayment(db, id, {
      amount,
      payment_date,
      payment_method,
      reference,
      notes,
      revenue_id: revenueId
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error('Erreur lors de la création du paiement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un paiement
router.put('/:projectId/payments/:paymentId', async (req, res) => {
  const db = req.app.locals.db;
  const { paymentId } = req.params;
  const { amount, payment_date, payment_method, reference, notes } = req.body;

  try {
    const updatedPayment = await projectPaymentModel.updateProjectPayment(db, paymentId, {
      amount,
      payment_date,
      payment_method,
      reference,
      notes
    });

    res.json(updatedPayment);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du paiement:', error);

    if (error.message === 'Paiement non trouvé') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un paiement
router.delete('/:projectId/payments/:paymentId', async (req, res) => {
  const db = req.app.locals.db;
  const { paymentId } = req.params;

  try {
    await projectPaymentModel.deleteProjectPayment(db, paymentId);
    res.json({ message: 'Paiement supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du paiement:', error);

    if (error.message === 'Paiement non trouvé') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
