// backend/routes/revenuesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const revenueModel = require('../models/revenueModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les revenus avec filtres optionnels
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date, type, project_id } = req.query;
    const filters = { start_date, end_date, type, project_id };

    const revenues = await revenueModel.getAllRevenues(filters);
    res.json(revenues);
  } catch (error) {
    console.error('Erreur lors de la récupération des revenus:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Obtenir un revenu spécifique
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const revenue = await revenueModel.getRevenueById(id);

    if (!revenue) {
      return res.status(404).json({ message: 'Revenu non trouvé' });
    }

    res.json(revenue);
  } catch (error) {
    console.error('Erreur lors de la récupération du revenu:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Créer un nouveau revenu
router.post('/', async (req, res) => {
  try {
    const revenue = await revenueModel.createRevenue(req.body);
    res.status(201).json(revenue);
  } catch (error) {
    console.error('Erreur lors de la création du revenu:', error);
    if (error.message.includes('requis')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour un revenu
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const revenue = await revenueModel.updateRevenue(id, req.body);
    res.json(revenue);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du revenu:', error);
    if (error.message === 'Revenu non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Supprimer un revenu
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await revenueModel.deleteRevenue(id);
    res.json({ message: 'Revenu supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du revenu:', error);
    if (error.message === 'Revenu non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Obtenir les statistiques des revenus
router.get('/stats/summary', async (req, res) => {
  try {
    const { period } = req.query;
    const stats = await revenueModel.getRevenueStats(period);
    res.json(stats);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
