// backend/routes/eventsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const eventModel = require('../models/eventModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les événements avec filtres optionnels
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const filters = { start_date, end_date };

    const events = await eventModel.getAllEvents(filters);
    res.json(events);
  } catch (error) {
    console.error('Erreur lors de la récupération des événements:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Obtenir un événement spécifique
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const event = await eventModel.getEventById(id);

    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    res.json(event);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'événement:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Créer un nouvel événement
router.post('/', async (req, res) => {
  try {
    const event = await eventModel.createEvent(req.body);
    res.status(201).json(event);
  } catch (error) {
    console.error('Erreur lors de la création de l\'événement:', error);
    if (error.message.includes('requis')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour un événement
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const event = await eventModel.updateEvent(id, req.body);
    res.json(event);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'événement:', error);
    if (error.message === 'Événement non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Supprimer un événement
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await eventModel.deleteEvent(id);
    res.json({ message: 'Événement supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'événement:', error);
    if (error.message === 'Événement non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Obtenir les événements pour une période spécifique
router.get('/range/:start/:end', async (req, res) => {
  try {
    const { start, end } = req.params;

    if (!start || !end) {
      return res.status(400).json({ message: 'Les dates de début et de fin sont requises' });
    }

    const events = await eventModel.getEventsByRange(start, end);
    res.json(events);
  } catch (error) {
    console.error('Erreur lors de la récupération des événements par période:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
