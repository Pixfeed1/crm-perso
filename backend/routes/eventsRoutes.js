// backend/routes/eventsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const eventModel = require('../models/eventModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les événements
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const { start_date, end_date } = req.query;

  try {
    const events = await eventModel.getAllEvents(db, { start_date, end_date });
    res.json(events);
  } catch (error) {
    console.error('Erreur lors de la récupération des événements:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un événement spécifique
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const event = await eventModel.getEventById(db, id);

    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    res.json(event);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un nouvel événement
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const {
    title,
    description,
    start_datetime,
    end_datetime,
    all_day,
    location,
    category,
    priority,
    color,
    reminder_time,
    activity_id
  } = req.body;

  if (!title || !start_datetime) {
    return res.status(400).json({ message: 'Titre et date de début sont requis' });
  }

  try {
    const event = await eventModel.createEvent(db, {
      title,
      description,
      start_datetime,
      end_datetime,
      all_day,
      location,
      category,
      priority,
      color,
      reminder_time,
      activity_id
    });

    res.status(201).json(event);
  } catch (error) {
    console.error('Erreur lors de la création de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un événement
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const {
    title,
    description,
    start_datetime,
    end_datetime,
    all_day,
    location,
    category,
    priority,
    color,
    reminder_time,
    activity_id
  } = req.body;

  try {
    // Vérifier si l'événement existe
    const existingEvent = await eventModel.getEventById(db, id);
    if (!existingEvent) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    const updatedEvent = await eventModel.updateEvent(db, id, {
      title,
      description,
      start_datetime,
      end_datetime,
      all_day,
      location,
      category,
      priority,
      color,
      reminder_time,
      activity_id
    });

    res.json(updatedEvent);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un événement
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // Vérifier si l'événement existe
    const existingEvent = await eventModel.getEventById(db, id);
    if (!existingEvent) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    await eventModel.deleteEvent(db, id);
    res.json({ message: 'Événement supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
