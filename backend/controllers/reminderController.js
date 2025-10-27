// backend/controllers/reminderController.js

const reminderModel = require('../models/reminderModel');

/**
 * Récupère tous les rappels actifs
 */
const getActiveReminders = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const reminders = await reminderModel.getActiveReminders(db);
    res.json(reminders);
  } catch (error) {
    console.error('Erreur lors de la récupération des rappels actifs:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Récupère les rappels en retard
 */
const getOverdueReminders = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const reminders = await reminderModel.getOverdueReminders(db);
    res.json(reminders);
  } catch (error) {
    console.error('Erreur lors de la récupération des rappels en retard:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Récupère les rappels à venir
 */
const getUpcomingReminders = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const days = parseInt(req.query.days) || 7;
    const reminders = await reminderModel.getUpcomingReminders(db, days);
    res.json(reminders);
  } catch (error) {
    console.error('Erreur lors de la récupération des rappels à venir:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Récupère les rappels pour une entité spécifique
 */
const getRemindersByEntity = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { entityType, entityId } = req.params;

    // Valider entity_type
    const validTypes = ['lead', 'project', 'goal', 'activity'];
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({
        message: 'Type d\'entité invalide',
        validTypes
      });
    }

    const reminders = await reminderModel.getRemindersByEntity(db, entityType, entityId);
    res.json(reminders);
  } catch (error) {
    console.error('Erreur lors de la récupération des rappels pour l\'entité:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Récupère un rappel par son ID
 */
const getReminderById = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const reminder = await reminderModel.getReminderById(db, id);

    if (!reminder) {
      return res.status(404).json({ message: 'Rappel non trouvé' });
    }

    res.json(reminder);
  } catch (error) {
    console.error('Erreur lors de la récupération du rappel:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Crée un nouveau rappel
 */
const createReminder = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { entity_type, entity_id, title, description, due_date, priority } = req.body;

    // Validation
    if (!entity_type || !entity_id || !title || !due_date) {
      return res.status(400).json({
        message: 'Champs requis manquants',
        required: ['entity_type', 'entity_id', 'title', 'due_date']
      });
    }

    // Valider entity_type
    const validTypes = ['lead', 'project', 'goal', 'activity'];
    if (!validTypes.includes(entity_type)) {
      return res.status(400).json({
        message: 'Type d\'entité invalide',
        validTypes
      });
    }

    // Valider priority
    const validPriorities = ['low', 'medium', 'high'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        message: 'Priorité invalide',
        validPriorities
      });
    }

    // Valider due_date
    const dueDate = new Date(due_date);
    if (isNaN(dueDate.getTime())) {
      return res.status(400).json({
        message: 'Format de date invalide'
      });
    }

    const reminderData = {
      entity_type,
      entity_id: parseInt(entity_id),
      title,
      description,
      due_date,
      priority: priority || 'medium'
    };

    const newReminder = await reminderModel.createReminder(db, reminderData);
    res.status(201).json(newReminder);
  } catch (error) {
    console.error('Erreur lors de la création du rappel:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Met à jour un rappel
 */
const updateReminder = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { title, description, due_date, priority, status } = req.body;

    // Vérifier que le rappel existe
    const existingReminder = await reminderModel.getReminderById(db, id);
    if (!existingReminder) {
      return res.status(404).json({ message: 'Rappel non trouvé' });
    }

    // Valider priority si fourni
    if (priority) {
      const validPriorities = ['low', 'medium', 'high'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          message: 'Priorité invalide',
          validPriorities
        });
      }
    }

    // Valider status si fourni
    if (status) {
      const validStatuses = ['pending', 'completed', 'dismissed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          message: 'Statut invalide',
          validStatuses
        });
      }
    }

    // Valider due_date si fourni
    if (due_date) {
      const dueDate = new Date(due_date);
      if (isNaN(dueDate.getTime())) {
        return res.status(400).json({
          message: 'Format de date invalide'
        });
      }
    }

    const reminderData = {};
    if (title !== undefined) reminderData.title = title;
    if (description !== undefined) reminderData.description = description;
    if (due_date !== undefined) reminderData.due_date = due_date;
    if (priority !== undefined) reminderData.priority = priority;
    if (status !== undefined) reminderData.status = status;

    const updatedReminder = await reminderModel.updateReminder(db, id, reminderData);
    res.json(updatedReminder);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du rappel:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Marque un rappel comme complété
 */
const completeReminder = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const updatedReminder = await reminderModel.completeReminder(db, id);
    res.json(updatedReminder);
  } catch (error) {
    console.error('Erreur lors du marquage du rappel comme complété:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Rejette/dismiss un rappel
 */
const dismissReminder = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const updatedReminder = await reminderModel.dismissReminder(db, id);
    res.json(updatedReminder);
  } catch (error) {
    console.error('Erreur lors du rejet du rappel:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Supprime un rappel
 */
const deleteReminder = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Vérifier que le rappel existe
    const existingReminder = await reminderModel.getReminderById(db, id);
    if (!existingReminder) {
      return res.status(404).json({ message: 'Rappel non trouvé' });
    }

    await reminderModel.deleteReminder(db, id);
    res.json({ message: 'Rappel supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du rappel:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Compte les rappels actifs et en retard
 */
const getRemindersCount = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const activeCount = await reminderModel.countActiveReminders(db);
    const overdueCount = await reminderModel.countOverdueReminders(db);

    res.json({
      active: activeCount,
      overdue: overdueCount
    });
  } catch (error) {
    console.error('Erreur lors du comptage des rappels:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

module.exports = {
  getActiveReminders,
  getOverdueReminders,
  getUpcomingReminders,
  getRemindersByEntity,
  getReminderById,
  createReminder,
  updateReminder,
  completeReminder,
  dismissReminder,
  deleteReminder,
  getRemindersCount
};
