// backend/routes/reminderRoutes.js

const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');

/**
 * ROUTES DES RELANCES AUTOMATIQUES DE FACTURES
 *
 * Base: /api/reminders
 */

// Configuration du système de relances
router.get('/settings', reminderController.getSettings);
router.put('/settings', reminderController.updateSettings);

// Détection et envoi
router.get('/detect', reminderController.detectInvoicesNeedingReminder);
router.post('/send/:invoiceId', reminderController.sendReminder);
router.post('/send-batch', reminderController.sendBatchReminders);

// Historique et statistiques
router.get('/stats', reminderController.getStats);
router.get('/history', reminderController.getAllReminders);
router.get('/invoice/:invoiceId', reminderController.getRemindersByInvoice);
router.delete('/invoice/:invoiceId', reminderController.deleteRemindersByInvoice);

module.exports = router;
