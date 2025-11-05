// backend/routes/revenuesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const revenueModel = require('../models/revenueModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir les statistiques des revenus
router.get('/stats', async (req, res) => {
  const db = req.app.locals.db;
  const { start_date, end_date, type, project_id } = req.query;

  try {
    const stats = await revenueModel.getRevenueStats(db.pool, {
      start_date,
      end_date,
      type,
      project_id
    });
    res.json(stats);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir tous les revenus
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const { start_date, end_date, type, project_id } = req.query;

  try {
    const revenues = await revenueModel.getAllRevenues(db.pool, {
      start_date,
      end_date,
      type,
      project_id
    });
    res.json(revenues);
  } catch (error) {
    console.error('Erreur lors de la récupération des revenus:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un revenu spécifique
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const revenue = await revenueModel.getRevenueById(db.pool, id);

    if (!revenue) {
      return res.status(404).json({ message: 'Revenu non trouvé' });
    }

    res.json(revenue);
  } catch (error) {
    console.error('Erreur lors de la récupération du revenu:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un nouveau revenu
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const { amount, date, description, project_id, lead_id, type } = req.body;

  if (!amount || !date || !type) {
    return res.status(400).json({ message: 'Montant, date et type sont requis' });
  }

  try {
    const revenue = await revenueModel.createRevenue(db.pool, {
      amount,
      date,
      description,
      project_id,
      lead_id,
      type
    });

    res.status(201).json(revenue);
  } catch (error) {
    console.error('Erreur lors de la création du revenu:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un revenu
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { amount, date, description, project_id, lead_id, type } = req.body;

  try {
    // Vérifier si le revenu existe
    const existingRevenue = await revenueModel.getRevenueById(db.pool, id);
    if (!existingRevenue) {
      return res.status(404).json({ message: 'Revenu non trouvé' });
    }

    const updatedRevenue = await revenueModel.updateRevenue(db.pool, id, {
      amount,
      date,
      description,
      project_id,
      lead_id,
      type
    });

    res.json(updatedRevenue);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du revenu:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un revenu
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // Vérifier si le revenu existe
    const existingRevenue = await revenueModel.getRevenueById(db.pool, id);
    if (!existingRevenue) {
      return res.status(404).json({ message: 'Revenu non trouvé' });
    }

    await revenueModel.deleteRevenue(db.pool, id);
    res.json({ message: 'Revenu supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du revenu:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
