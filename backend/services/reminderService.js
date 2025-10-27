// backend/services/reminderService.js

const reminderModel = require('../models/reminderModel');
const emailService = require('./emailService');

/**
 * SERVICE D'ENVOI DE RELANCES AUTOMATIQUES
 *
 * Gère l'envoi d'emails de relance pour les factures impayées
 * et la création d'enregistrements dans l'historique
 */

/**
 * Génère le contenu HTML d'un email de relance
 * @param {Object} invoice - Données de la facture
 * @param {number} reminderLevel - Niveau de relance (1, 2, 3)
 * @param {Object} config - Configuration des relances
 * @returns {string} - Contenu HTML de l'email
 */
const generateReminderEmailHtml = (invoice, reminderLevel, config) => {
  const dueDate = new Date(invoice.due_date);
  const today = new Date();
  const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Messages selon le niveau de relance
  const messages = {
    1: {
      title: '=Ë Rappel de paiement',
      intro: 'Nous vous rappelons qu\'une facture reste en attente de paiement.',
      tone: 'cordial',
      color: '#F59E0B' // amber
    },
    2: {
      title: '  2ème rappel - Facture impayée',
      intro: 'Malgré notre précédent rappel, nous constatons que votre facture reste impayée.',
      tone: 'ferme',
      color: '#EF4444' // red
    },
    3: {
      title: '=4 Dernier rappel - Facture en souffrance',
      intro: 'Nous vous informons que votre facture est toujours impayée malgré nos précédents rappels.',
      tone: 'formel',
      color: '#DC2626' // dark red
    }
  };

  const message = messages[reminderLevel] || messages[1];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relance de paiement - Facture ${invoice.invoice_number}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #F9FAFB;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

              <!-- En-tête avec bande de couleur -->
              <tr>
                <td style="background-color: ${message.color}; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; color: #FFFFFF; font-size: 24px;">
                    ${message.title}
                  </h1>
                </td>
              </tr>

              <!-- Contenu principal -->
              <tr>
                <td style="padding: 30px;">
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #374151;">
                    Bonjour ${invoice.client_name || ''},
                  </p>

                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                    ${message.intro}
                  </p>

                  <!-- Encadré facture -->
                  <div style="background-color: #FEF3C7; border-left: 4px solid ${message.color}; padding: 20px; margin: 25px 0; border-radius: 4px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400E;">Facture n° :</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #92400E; font-weight: 600;">${invoice.invoice_number}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400E;">Date d'émission :</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #92400E;">${formatDate(invoice.issue_date)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400E;">Date d'échéance :</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #DC2626; font-weight: 600;">${formatDate(invoice.due_date)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400E;">Retard :</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #DC2626; font-weight: 600;">${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}</span>
                        </td>
                      </tr>
                      <tr style="border-top: 2px solid ${message.color};">
                        <td style="padding: 12px 0 0 0;">
                          <strong style="color: #92400E; font-size: 18px;">Montant dû :</strong>
                        </td>
                        <td style="padding: 12px 0 0 0; text-align: right;">
                          <span style="color: #DC2626; font-size: 22px; font-weight: 700;">${formatAmount(invoice.amount_remaining || invoice.total_ttc)}</span>
                        </td>
                      </tr>
                    </table>
                  </div>

                  ${reminderLevel === 1 ? `
                    <p style="margin: 20px 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                      Si vous avez déjà effectué ce règlement, veuillez ne pas tenir compte de ce message.
                    </p>
                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                      Dans le cas contraire, nous vous remercions de bien vouloir procéder au paiement dans les plus brefs délais.
                    </p>
                  ` : ''}

                  ${reminderLevel === 2 ? `
                    <p style="margin: 20px 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                      Nous vous demandons de régulariser votre situation <strong>dans les 7 jours</strong> suivant la réception de ce courrier.
                    </p>
                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                      Si vous rencontrez des difficultés de paiement, nous vous invitons à nous contacter rapidement afin de trouver ensemble une solution.
                    </p>
                  ` : ''}

                  ${reminderLevel === 3 ? `
                    <p style="margin: 20px 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                      <strong>Ceci constitue notre dernier rappel amiable.</strong>
                    </p>
                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                      À défaut de règlement sous <strong>5 jours ouvrés</strong>, nous serons contraints d'engager une procédure de recouvrement contentieux, conformément aux dispositions légales en vigueur.
                    </p>
                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                      Nous vous rappelons que des pénalités de retard ainsi qu'une indemnité forfaitaire de 40 ¬ pour frais de recouvrement pourront être appliquées.
                    </p>
                  ` : ''}

                  <p style="margin: 20px 0 15px 0; font-size: 16px; color: #374151; line-height: 1.5;">
                    Pour toute question, n'hésitez pas à nous contacter.
                  </p>

                  <p style="margin: 30px 0 0 0; font-size: 16px; color: #374151;">
                    ${reminderLevel >= 2 ? 'Salutations distinguées' : 'Cordialement'}
                  </p>
                </td>
              </tr>

              <!-- Pied de page -->
              <tr>
                <td style="background-color: #F3F4F6; padding: 20px; border-radius: 0 0 8px 8px; border-top: 1px solid #E5E7EB;">
                  <p style="margin: 0; font-size: 12px; color: #6B7280; text-align: center; line-height: 1.4;">
                    Ce message a été envoyé automatiquement depuis notre système de gestion.<br>
                    Merci de ne pas répondre directement à cet email.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return html;
};

/**
 * Génère le sujet de l'email de relance
 * @param {Object} invoice - Données de la facture
 * @param {number} reminderLevel - Niveau de relance
 * @param {Object} config - Configuration des relances
 * @returns {string} - Sujet de l'email
 */
const generateReminderSubject = (invoice, reminderLevel, config) => {
  const subjectTemplates = {
    1: config.email_subject_1 || 'Rappel - Facture {invoice_number} en attente de paiement',
    2: config.email_subject_2 || '2ème rappel - Facture {invoice_number} en retard',
    3: config.email_subject_3 || 'Dernier rappel - Facture {invoice_number} impayée'
  };

  const template = subjectTemplates[reminderLevel] || subjectTemplates[1];

  // Remplacer les placeholders
  return template
    .replace(/{invoice_number}/g, invoice.invoice_number)
    .replace(/{client_name}/g, invoice.client_name || '')
    .replace(/{amount}/g, invoice.amount_remaining || invoice.total_ttc);
};

/**
 * Envoie un email de relance pour une facture
 * @param {Object} db - Instance de la base de données
 * @param {Object} invoice - Données de la facture
 * @param {number} reminderLevel - Niveau de relance (1, 2, 3)
 * @returns {Promise<Object>} - Résultat de l'envoi
 */
const sendReminderEmail = async (db, invoice, reminderLevel) => {
  try {
    // Vérifier que l'email client existe
    if (!invoice.client_email) {
      throw new Error('Aucun email défini pour ce client');
    }

    // Récupérer la configuration
    const config = await reminderModel.getReminderConfig(db);

    // Calculer le nombre de jours de retard
    const dueDate = new Date(invoice.due_date);
    const today = new Date();
    const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

    // Générer le contenu de l'email
    const subject = generateReminderSubject(invoice, reminderLevel, config);
    const html = generateReminderEmailHtml(invoice, reminderLevel, config);

    // Envoyer l'email
    const emailResult = await emailService.sendEmail({
      to: invoice.client_email,
      subject,
      html,
      ccToSelf: true // Copie pour l'expéditeur
    });

    // Créer l'enregistrement dans l'historique
    const reminderRecord = await reminderModel.createReminder(db, {
      invoice_id: invoice.id,
      reminder_level: reminderLevel,
      email_sent_to: invoice.client_email,
      days_overdue: daysOverdue,
      status: 'sent',
      notes: `Email envoyé avec succès. Message ID: ${emailResult.messageId}`
    });

    console.log(` Relance niveau ${reminderLevel} envoyée pour facture ${invoice.invoice_number}`);

    return {
      success: true,
      reminder: reminderRecord,
      emailResult
    };
  } catch (error) {
    console.error(`L Erreur lors de l'envoi de la relance pour facture ${invoice.invoice_number}:`, error);

    // Enregistrer l'échec dans l'historique
    try {
      await reminderModel.createReminder(db, {
        invoice_id: invoice.id,
        reminder_level: reminderLevel,
        email_sent_to: invoice.client_email || 'N/A',
        days_overdue: Math.floor((new Date() - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24)),
        status: 'failed',
        error_message: error.message,
        notes: `Échec de l'envoi : ${error.message}`
      });
    } catch (dbError) {
      console.error('Erreur lors de l\'enregistrement de l\'échec:', dbError);
    }

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Envoie des relances en batch pour plusieurs factures
 * @param {Object} db - Instance de la base de données
 * @param {Array} invoices - Liste des factures avec next_reminder_level
 * @returns {Promise<Object>} - Résultat de l'envoi en batch
 */
const sendBatchReminders = async (db, invoices) => {
  const results = {
    sent: 0,
    failed: 0,
    details: []
  };

  for (const invoice of invoices) {
    const result = await sendReminderEmail(db, invoice, invoice.next_reminder_level);

    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
    }

    results.details.push({
      invoice_number: invoice.invoice_number,
      reminder_level: invoice.next_reminder_level,
      success: result.success,
      error: result.error || null
    });

    // Pause de 1 seconde entre chaque envoi pour éviter de surcharger le serveur email
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n=ç Envoi batch terminé: ${results.sent} réussis, ${results.failed} échecs`);

  return results;
};

module.exports = {
  sendReminderEmail,
  sendBatchReminders,
  generateReminderEmailHtml,
  generateReminderSubject
};
