// backend/controllers/reminderController.js

const reminderModel = require('../models/reminderModel');
const reminderService = require('../services/reminderService');

/**
 * CONTRÔLEUR DES RELANCES AUTOMATIQUES DE FACTURES
 *
 * Gère les endpoints API pour :
 * - Configuration du système de relances
 * - Détection des factures nécessitant une relance
 * - Envoi manuel de relances
 * - Historique et statistiques
 */

/**
 * GET /api/reminders/settings
 * Récupère les paramètres du système de relances
 */
const getSettings = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Récupérer l'état d'activation
    const enabledSetting = await reminderModel.getSetting(db, 'reminders_enabled');
    const enabled = enabledSetting ? enabledSetting.value : false;

    // Récupérer la configuration
    const configSetting = await reminderModel.getSetting(db, 'reminder_config');
    const config = configSetting ? configSetting.value : {
      reminder_1_days: 7,
      reminder_2_days: 14,
      reminder_3_days: 21,
      email_subject_1: 'Rappel - Facture {invoice_number} en attente de paiement',
      email_subject_2: '2ème rappel - Facture {invoice_number} en retard',
      email_subject_3: 'Dernier rappel - Facture {invoice_number} impayée'
    };

    res.json({
      enabled,
      config
    });
  } catch (error) {
    console.error('Erreur getSettings:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des paramètres',
      error: error.message
    });
  }
};

/**
 * PUT /api/reminders/settings
 * Met à jour les paramètres du système de relances
 */
const updateSettings = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { enabled, config } = req.body;

    // Mettre à jour l'état d'activation si fourni
    if (enabled !== undefined) {
      await reminderModel.updateSetting(db, 'reminders_enabled', enabled);
    }

    // Mettre à jour la configuration si fournie
    if (config !== undefined) {
      // Validation basique
      if (config.reminder_1_days && config.reminder_1_days < 1) {
        return res.status(400).json({
          message: 'Les intervalles de relance doivent être positifs'
        });
      }

      await reminderModel.updateSetting(db, 'reminder_config', config);
    }

    // Récupérer les nouveaux paramètres
    const updatedSettings = await getSettingsInternal(db);

    res.json({
      message: 'Paramètres mis à jour avec succès',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Erreur updateSettings:', error);
    res.status(500).json({
      message: 'Erreur lors de la mise à jour des paramètres',
      error: error.message
    });
  }
};

/**
 * GET /api/reminders/detect
 * Détecte les factures nécessitant une relance
 */
const detectInvoicesNeedingReminder = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const invoices = await reminderModel.detectInvoicesNeedingReminder(db);

    res.json({
      count: invoices.length,
      invoices
    });
  } catch (error) {
    console.error('Erreur detectInvoicesNeedingReminder:', error);
    res.status(500).json({
      message: 'Erreur lors de la détection des factures',
      error: error.message
    });
  }
};

/**
 * POST /api/reminders/send/:invoiceId
 * Envoie manuellement une relance pour une facture
 */
const sendReminder = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { invoiceId } = req.params;
    const { reminder_level } = req.body;

    // Validation
    if (!reminder_level || reminder_level < 1 || reminder_level > 3) {
      return res.status(400).json({
        message: 'Le niveau de relance doit être 1, 2 ou 3'
      });
    }

    // Vérifier si les relances sont activées
    const enabled = await reminderModel.isRemindersEnabled(db);
    if (!enabled) {
      return res.status(403).json({
        message: 'Le système de relances est désactivé. Activez-le dans les paramètres.'
      });
    }

    // Récupérer la facture
    const invoice = await db.pool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [invoiceId]
    );

    if (invoice.rows.length === 0) {
      return res.status(404).json({
        message: 'Facture non trouvée'
      });
    }

    const invoiceData = invoice.rows[0];

    // Vérifier que la facture est impayée
    if (invoiceData.payment_status === 'paid') {
      return res.status(400).json({
        message: 'Cette facture est déjà payée'
      });
    }

    // Envoyer la relance
    const result = await reminderService.sendReminderEmail(db, invoiceData, reminder_level);

    if (result.success) {
      res.json({
        message: 'Relance envoyée avec succès',
        reminder: result.reminder
      });
    } else {
      res.status(500).json({
        message: 'Erreur lors de l\'envoi de la relance',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Erreur sendReminder:', error);
    res.status(500).json({
      message: 'Erreur lors de l\'envoi de la relance',
      error: error.message
    });
  }
};

/**
 * POST /api/reminders/send-batch
 * Envoie les relances pour toutes les factures détectées
 */
const sendBatchReminders = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Vérifier si les relances sont activées
    const enabled = await reminderModel.isRemindersEnabled(db);
    if (!enabled) {
      return res.status(403).json({
        message: 'Le système de relances est désactivé. Activez-le dans les paramètres.'
      });
    }

    // Détecter les factures nécessitant une relance
    const invoices = await reminderModel.detectInvoicesNeedingReminder(db);

    if (invoices.length === 0) {
      return res.json({
        message: 'Aucune facture ne nécessite de relance',
        sent: 0,
        failed: 0
      });
    }

    // Envoyer les relances
    const results = await reminderService.sendBatchReminders(db, invoices);

    res.json({
      message: `${results.sent} relance(s) envoyée(s), ${results.failed} échec(s)`,
      sent: results.sent,
      failed: results.failed,
      details: results.details
    });
  } catch (error) {
    console.error('Erreur sendBatchReminders:', error);
    res.status(500).json({
      message: 'Erreur lors de l\'envoi des relances',
      error: error.message
    });
  }
};

/**
 * GET /api/reminders/invoice/:invoiceId
 * Récupère l'historique des relances pour une facture
 */
const getRemindersByInvoice = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { invoiceId } = req.params;

    const reminders = await reminderModel.getRemindersByInvoice(db, invoiceId);

    res.json(reminders);
  } catch (error) {
    console.error('Erreur getRemindersByInvoice:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération de l\'historique',
      error: error.message
    });
  }
};

/**
 * GET /api/reminders/history
 * Récupère l'historique de toutes les relances (avec pagination)
 */
const getAllReminders = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const reminders = await reminderModel.getAllReminders(db, limit, offset);

    res.json({
      reminders,
      limit,
      offset,
      count: reminders.length
    });
  } catch (error) {
    console.error('Erreur getAllReminders:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération de l\'historique',
      error: error.message
    });
  }
};

/**
 * GET /api/reminders/stats
 * Récupère les statistiques des relances
 */
const getStats = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const stats = await reminderModel.getReminderStats(db);

    res.json(stats);
  } catch (error) {
    console.error('Erreur getStats:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
};

/**
 * DELETE /api/reminders/invoice/:invoiceId
 * Supprime l'historique des relances pour une facture
 */
const deleteRemindersByInvoice = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { invoiceId } = req.params;

    const deletedCount = await reminderModel.deleteRemindersByInvoice(db, invoiceId);

    res.json({
      message: `${deletedCount} relance(s) supprimée(s)`,
      deletedCount
    });
  } catch (error) {
    console.error('Erreur deleteRemindersByInvoice:', error);
    res.status(500).json({
      message: 'Erreur lors de la suppression de l\'historique',
      error: error.message
    });
  }
};

/**
 * Fonction helper pour récupérer les paramètres
 */
const getSettingsInternal = async (db) => {
  const enabledSetting = await reminderModel.getSetting(db, 'reminders_enabled');
  const enabled = enabledSetting ? enabledSetting.value : false;

  const configSetting = await reminderModel.getSetting(db, 'reminder_config');
  const config = configSetting ? configSetting.value : {
    reminder_1_days: 7,
    reminder_2_days: 14,
    reminder_3_days: 21,
    email_subject_1: 'Rappel - Facture {invoice_number} en attente de paiement',
    email_subject_2: '2ème rappel - Facture {invoice_number} en retard',
    email_subject_3: 'Dernier rappel - Facture {invoice_number} impayée'
  };

  return { enabled, config };
};

module.exports = {
  getSettings,
  updateSettings,
  detectInvoicesNeedingReminder,
  sendReminder,
  sendBatchReminders,
  getRemindersByInvoice,
  getAllReminders,
  getStats,
  deleteRemindersByInvoice
};
