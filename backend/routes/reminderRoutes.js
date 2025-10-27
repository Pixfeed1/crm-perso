// backend/routes/reminderRoutes.js

const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');

// Routes de statistiques
router.get('/count', reminderController.getRemindersCount);

// Routes de récupération globales
router.get('/active', reminderController.getActiveReminders);
router.get('/overdue', reminderController.getOverdueReminders);
router.get('/upcoming', reminderController.getUpcomingReminders);

// Routes pour une entité spécifique
router.get('/entity/:entityType/:entityId', reminderController.getRemindersByEntity);

// Routes CRUD standard
router.get('/:id', reminderController.getReminderById);
router.post('/', reminderController.createReminder);
router.put('/:id', reminderController.updateReminder);
router.delete('/:id', reminderController.deleteReminder);

// Actions spécifiques
router.patch('/:id/complete', reminderController.completeReminder);
router.patch('/:id/dismiss', reminderController.dismissReminder);

module.exports = router;
