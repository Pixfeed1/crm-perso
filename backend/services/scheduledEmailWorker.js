// backend/services/scheduledEmailWorker.js
const cron = require('node-cron');
const scheduledEmailModel = require('../models/scheduledEmailModel');
const emailService = require('./emailService');

/**
 * WORKER POUR L'ENVOI AUTOMATIQUE DES EMAILS PROGRAMMÉS
 *
 * Ce service :
 * - S'exécute toutes les minutes
 * - Récupère les emails prêts à être envoyés
 * - Les envoie via le service email
 * - Met à jour leur statut
 */

class ScheduledEmailWorker {
  constructor() {
    this.db = null;
    this.isRunning = false;
    this.cronJob = null;
    this.processedCount = 0;
    this.errorCount = 0;
  }

  /**
   * Initialise le worker avec la connexion DB
   * @param {Object} db - Instance de la base de données
   */
  initialize(db) {
    this.db = db;
    console.log('📧 Worker emails programmés initialisé');
  }

  /**
   * Démarre le worker cron
   * Exécution toutes les minutes
   */
  start() {
    if (this.cronJob) {
      console.log('⚠️  Worker emails déjà démarré');
      return;
    }

    // Exécution toutes les minutes
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.processEmails();
    });

    console.log('✅ Worker emails programmés démarré (toutes les minutes)');
  }

  /**
   * Arrête le worker
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Worker emails programmés arrêté');
    }
  }

  /**
   * Traite les emails en attente
   */
  async processEmails() {
    // Éviter les exécutions simultanées
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Récupérer les emails prêts à être envoyés
      const emails = await scheduledEmailModel.getEmailsReadyToSend(this.db, 10);

      if (emails.length === 0) {
        this.isRunning = false;
        return;
      }

      console.log(`📧 Traitement de ${emails.length} email(s) programmé(s)...`);

      for (const email of emails) {
        await this.sendEmail(email);
      }

    } catch (error) {
      console.error('❌ Erreur lors du traitement des emails programmés:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Envoie un email programmé
   * @param {Object} email - Email à envoyer
   */
  async sendEmail(email) {
    try {
      console.log(`📧 Envoi de l'email #${email.id} à ${email.to_email}...`);

      // Préparer les pièces jointes
      const attachments = email.attachments || [];

      // Envoyer l'email
      await emailService.sendEmail({
        to: email.to_email,
        subject: email.subject,
        html: email.body_html,
        text: email.body_text || '',
        attachments: attachments.map(att => ({
          filename: att.filename,
          path: att.path,
          contentType: att.content_type
        })),
        ccToSelf: !!email.cc_email
      });

      // Marquer comme envoyé
      await scheduledEmailModel.markAsSent(this.db, email.id);
      this.processedCount++;

      // Log automatique dans Suivi pour un email programmé lié à un prospect (lead).
      if (email.related_type === 'lead' && email.related_id) {
        try {
          await this.db.pool.query(
            `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done)
             VALUES ('lead', $1, 'email', NOW(), $2, FALSE)`,
            [email.related_id, email.subject]
          );
        } catch (logErr) {
          console.error(`[Worker] Échec log interaction email #${email.id}:`, logErr.message);
        }
      }

      console.log(`✅ Email #${email.id} envoyé avec succès à ${email.to_email}`);

    } catch (error) {
      console.error(`❌ Erreur envoi email #${email.id}:`, error.message);

      // Marquer comme échoué
      await scheduledEmailModel.markAsFailed(this.db, email.id, error.message);
      this.errorCount++;
    }
  }

  /**
   * Récupère les statistiques du worker
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      cronActive: !!this.cronJob
    };
  }

  /**
   * Force le traitement immédiat des emails en attente
   */
  async forceProcess() {
    console.log('🔄 Traitement forcé des emails programmés...');
    await this.processEmails();
  }
}

// Export d'une instance singleton
const scheduledEmailWorker = new ScheduledEmailWorker();
module.exports = scheduledEmailWorker;
