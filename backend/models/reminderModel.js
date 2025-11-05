// backend/models/reminderModel.js
const { Pool } = require('pg');

/**
 * GESTION DES RELANCES AUTOMATIQUES POUR FACTURES IMPAYÉES
 *
 * Ce modèle gère :
 * - Paramètres du système de relances (activé/désactivé, intervalles)
 * - Détection des factures nécessitant une relance
 * - Historique des relances envoyées
 */

/**
 * Récupère un paramètre système
 * @param {Object} db - Instance de la base de données
 * @param {string} key - Clé du paramètre
 * @returns {Promise<Object|null>} - Paramètre ou null si non trouvé
 */
const getSetting = async (db, key) => {
  try {
    const result = await db.pool.query(
      'SELECT * FROM settings WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      ...result.rows[0],
      value: result.rows[0].value // Déjà un objet JSONB
    };
  } catch (error) {
    console.error('Erreur getSetting:', error);
    throw error;
  }
};

/**
 * Met à jour un paramètre système
 * @param {Object} db - Instance de la base de données
 * @param {string} key - Clé du paramètre
 * @param {any} value - Nouvelle valeur (sera converti en JSONB)
 * @returns {Promise<Object>} - Paramètre mis à jour
 */
const updateSetting = async (db, key, value) => {
  try {
    const result = await db.pool.query(
      `UPDATE settings
       SET value = $1, updated_at = CURRENT_TIMESTAMP
       WHERE key = $2
       RETURNING *`,
      [JSON.stringify(value), key]
    );

    if (result.rows.length === 0) {
      throw new Error(`Paramètre ${key} non trouvé`);
    }

    return {
      ...result.rows[0],
      value: result.rows[0].value
    };
  } catch (error) {
    console.error('Erreur updateSetting:', error);
    throw error;
  }
};

/**
 * Vérifie si le système de relances est activé
 * @param {Object} db - Instance de la base de données
 * @returns {Promise<boolean>} - true si activé, false sinon
 */
const isRemindersEnabled = async (db) => {
  try {
    const setting = await getSetting(db, 'reminders_enabled');
    return setting ? setting.value : false;
  } catch (error) {
    console.error('Erreur isRemindersEnabled:', error);
    return false;
  }
};

/**
 * Récupère la configuration des relances
 * @param {Object} db - Instance de la base de données
 * @returns {Promise<Object>} - Configuration des relances
 */
const getReminderConfig = async (db) => {
  try {
    const setting = await getSetting(db, 'reminder_config');
    return setting ? setting.value : {
      reminder_1_days: 7,
      reminder_2_days: 14,
      reminder_3_days: 21,
      email_subject_1: 'Rappel - Facture {invoice_number} en attente de paiement',
      email_subject_2: '2ème rappel - Facture {invoice_number} en retard',
      email_subject_3: 'Dernier rappel - Facture {invoice_number} impayée'
    };
  } catch (error) {
    console.error('Erreur getReminderConfig:', error);
    throw error;
  }
};

/**
 * Détecte les factures nécessitant une relance
 * @param {Object} db - Instance de la base de données
 * @returns {Promise<Array>} - Liste des factures avec niveau de relance suggéré
 */
const detectInvoicesNeedingReminder = async (db) => {
  try {
    // Vérifier si les relances sont activées
    const enabled = await isRemindersEnabled(db);
    if (!enabled) {
      return [];
    }

    // Récupérer la configuration
    const config = await getReminderConfig(db);

    // Récupérer toutes les factures en retard ou en attente de paiement
    const invoices = await db.pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.client_name,
        i.client_email,
        i.total_ttc,
        i.amount_remaining,
        i.payment_status,
        i.due_date,
        i.issue_date,
        CURRENT_DATE - i.due_date AS days_overdue
      FROM invoices i
      WHERE i.payment_status IN ('pending', 'partial', 'overdue')
        AND i.due_date < CURRENT_DATE
        AND i.amount_remaining > 0
      ORDER BY days_overdue DESC
    `);

    // Pour chaque facture, vérifier les relances déjà envoyées
    const invoicesNeedingReminder = [];

    for (const invoice of invoices.rows) {
      const daysOverdue = parseInt(invoice.days_overdue);

      // Récupérer l'historique des relances pour cette facture
      const reminders = await db.pool.query(
        `SELECT reminder_level, sent_at
         FROM invoice_reminders
         WHERE invoice_id = $1 AND status = 'sent'
         ORDER BY reminder_level DESC
         LIMIT 1`,
        [invoice.id]
      );

      const lastReminder = reminders.rows.length > 0 ? reminders.rows[0] : null;
      const lastReminderLevel = lastReminder ? lastReminder.reminder_level : 0;

      // Déterminer si une nouvelle relance est nécessaire
      let nextReminderLevel = null;

      if (daysOverdue >= config.reminder_3_days && lastReminderLevel < 3) {
        nextReminderLevel = 3;
      } else if (daysOverdue >= config.reminder_2_days && lastReminderLevel < 2) {
        nextReminderLevel = 2;
      } else if (daysOverdue >= config.reminder_1_days && lastReminderLevel < 1) {
        nextReminderLevel = 1;
      }

      if (nextReminderLevel) {
        invoicesNeedingReminder.push({
          ...invoice,
          next_reminder_level: nextReminderLevel,
          last_reminder_level: lastReminderLevel,
          last_reminder_sent_at: lastReminder ? lastReminder.sent_at : null
        });
      }
    }

    return invoicesNeedingReminder;
  } catch (error) {
    console.error('Erreur detectInvoicesNeedingReminder:', error);
    throw error;
  }
};

/**
 * Crée un enregistrement de relance
 * @param {Object} db - Instance de la base de données
 * @param {Object} reminderData - Données de la relance
 * @returns {Promise<Object>} - Relance créée
 */
const createReminder = async (db, reminderData) => {
  try {
    const {
      invoice_id,
      reminder_level,
      email_sent_to,
      days_overdue,
      status = 'sent',
      error_message = null,
      notes = null
    } = reminderData;

    const result = await db.pool.query(
      `INSERT INTO invoice_reminders
       (invoice_id, reminder_level, email_sent_to, days_overdue, status, error_message, notes, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING *`,
      [invoice_id, reminder_level, email_sent_to, days_overdue, status, error_message, notes]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erreur createReminder:', error);
    throw error;
  }
};

/**
 * Récupère l'historique des relances pour une facture
 * @param {Object} db - Instance de la base de données
 * @param {number} invoiceId - ID de la facture
 * @returns {Promise<Array>} - Liste des relances
 */
const getRemindersByInvoice = async (db, invoiceId) => {
  try {
    const result = await db.pool.query(
      `SELECT r.*, i.invoice_number, i.client_name, i.client_email
       FROM invoice_reminders r
       JOIN invoices i ON i.id = r.invoice_id
       WHERE r.invoice_id = $1
       ORDER BY r.sent_at DESC`,
      [invoiceId]
    );

    return result.rows;
  } catch (error) {
    console.error('Erreur getRemindersByInvoice:', error);
    throw error;
  }
};

/**
 * Récupère toutes les relances (avec pagination)
 * @param {Object} db - Instance de la base de données
 * @param {number} limit - Nombre de résultats
 * @param {number} offset - Décalage
 * @returns {Promise<Array>} - Liste des relances
 */
const getAllReminders = async (db, limit = 50, offset = 0) => {
  try {
    const result = await db.pool.query(
      `SELECT r.*, i.invoice_number, i.client_name, i.client_email, i.amount_remaining
       FROM invoice_reminders r
       JOIN invoices i ON i.id = r.invoice_id
       ORDER BY r.sent_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  } catch (error) {
    console.error('Erreur getAllReminders:', error);
    throw error;
  }
};

/**
 * Récupère les statistiques des relances
 * @param {Object} db - Instance de la base de données
 * @returns {Promise<Object>} - Statistiques
 */
const getReminderStats = async (db) => {
  try {
    const result = await db.pool.query(`
      SELECT
        COUNT(DISTINCT invoice_id) as total_invoices_reminded,
        COUNT(*) as total_reminders_sent,
        SUM(CASE WHEN reminder_level = 1 THEN 1 ELSE 0 END) as level_1_count,
        SUM(CASE WHEN reminder_level = 2 THEN 1 ELSE 0 END) as level_2_count,
        SUM(CASE WHEN reminder_level = 3 THEN 1 ELSE 0 END) as level_3_count,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
      FROM invoice_reminders
    `);

    return result.rows[0];
  } catch (error) {
    console.error('Erreur getReminderStats:', error);
    throw error;
  }
};

/**
 * Supprime l'historique des relances pour une facture
 * @param {Object} db - Instance de la base de données
 * @param {number} invoiceId - ID de la facture
 * @returns {Promise<number>} - Nombre de relances supprimées
 */
const deleteRemindersByInvoice = async (db, invoiceId) => {
  try {
    const result = await db.pool.query(
      'DELETE FROM invoice_reminders WHERE invoice_id = $1',
      [invoiceId]
    );

    return result.rowCount;
  } catch (error) {
    console.error('Erreur deleteRemindersByInvoice:', error);
    throw error;
  }
};

module.exports = {
  getSetting,
  updateSetting,
  isRemindersEnabled,
  getReminderConfig,
  detectInvoicesNeedingReminder,
  createReminder,
  getRemindersByInvoice,
  getAllReminders,
  getReminderStats,
  deleteRemindersByInvoice
};
