// backend/services/maintenanceReminderWorker.js

const cron = require('node-cron');
const emailService = require('./emailService');

/**
 * Worker qui envoie des rappels pour les rapports de maintenance à envoyer
 * Vérifie quotidiennement les contrats dont le rapport est dû dans les prochains jours
 */

let db = null;
let cronJob = null;

/**
 * Récupère les contrats dont le rapport est dû bientôt (dans les X prochains jours)
 */
const getContractsNeedingReport = async (daysAhead = 1) => {
  const query = `
    SELECT
      mc.id,
      mc.site_name,
      mc.site_url,
      mc.next_report_due,
      mc.monthly_amount,
      c.name as client_name,
      c.email as client_email,
      (
        SELECT MAX(mr.period_end)
        FROM maintenance_reports mr
        WHERE mr.maintenance_contract_id = mc.id
      ) as last_report_date
    FROM maintenance_contracts mc
    LEFT JOIN crm_clients c ON mc.client_id = c.id
    WHERE mc.status = 'active'
      AND mc.next_report_due <= CURRENT_DATE + INTERVAL '${daysAhead} days'
      AND mc.next_report_due >= CURRENT_DATE
    ORDER BY mc.next_report_due ASC
  `;

  const result = await db.query(query);
  return result.rows;
};

/**
 * Récupère les contrats dont le rapport est en retard
 */
const getOverdueContracts = async () => {
  const query = `
    SELECT
      mc.id,
      mc.site_name,
      mc.site_url,
      mc.next_report_due,
      mc.monthly_amount,
      c.name as client_name,
      c.email as client_email,
      (
        SELECT MAX(mr.period_end)
        FROM maintenance_reports mr
        WHERE mr.maintenance_contract_id = mc.id
      ) as last_report_date
    FROM maintenance_contracts mc
    LEFT JOIN crm_clients c ON mc.client_id = c.id
    WHERE mc.status = 'active'
      AND mc.next_report_due < CURRENT_DATE
    ORDER BY mc.next_report_due ASC
  `;

  const result = await db.query(query);
  return result.rows;
};

/**
 * Vérifie et envoie les rappels si nécessaire
 */
const checkAndSendReminders = async () => {
  console.log('[MaintenanceReminder] Vérification des rapports à envoyer...');

  try {
    // Récupérer les contrats dont le rapport est dû bientôt (J-1 par défaut, configurable)
    const daysAhead = parseInt(process.env.REPORT_REMINDER_DAYS_AHEAD, 10) || 1;
    const upcomingContracts = await getContractsNeedingReport(daysAhead);

    // Récupérer les contrats en retard
    const overdueContracts = await getOverdueContracts();

    const allContracts = [...overdueContracts, ...upcomingContracts];

    if (allContracts.length === 0) {
      console.log('[MaintenanceReminder] Aucun rapport à envoyer prochainement');
      return;
    }

    console.log(`[MaintenanceReminder] ${allContracts.length} rapport(s) à envoyer`);

    // Envoyer le rappel
    await emailService.sendMaintenanceReportReminder(allContracts);

    console.log('[MaintenanceReminder] Rappel envoyé avec succès');

  } catch (error) {
    console.error('[MaintenanceReminder] Erreur lors de la vérification:', error.message);
  }
};

/**
 * Initialise le worker avec la connexion DB
 */
const initialize = (database) => {
  db = database;
  console.log('[MaintenanceReminder] Worker initialisé');
};

/**
 * Démarre le cron job
 * Par défaut: tous les jours à 9h00
 */
const start = (cronSchedule = '0 9 * * *') => {
  if (!db) {
    console.error('[MaintenanceReminder] Erreur: DB non initialisée');
    return;
  }

  // Arrêter le job existant si présent
  if (cronJob) {
    cronJob.stop();
  }

  // Créer le nouveau job
  cronJob = cron.schedule(cronSchedule, async () => {
    console.log('[MaintenanceReminder] Exécution du check quotidien...');
    await checkAndSendReminders();
  }, {
    scheduled: true,
    timezone: 'Europe/Paris'
  });

  console.log(`[MaintenanceReminder] Cron job démarré (schedule: ${cronSchedule})`);
  console.log('[MaintenanceReminder] Prochain check des rapports à 9h00');
};

/**
 * Arrête le cron job
 */
const stop = () => {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[MaintenanceReminder] Worker arrêté');
  }
};

/**
 * Exécute manuellement la vérification (pour tests)
 */
const runNow = async () => {
  if (!db) {
    throw new Error('DB non initialisée');
  }
  await checkAndSendReminders();
};

module.exports = {
  initialize,
  start,
  stop,
  runNow,
  getContractsNeedingReport,
  getOverdueContracts
};
