// backend/services/emailService.js
const nodemailer = require('nodemailer');

/**
 * Service d'envoi d'emails avec Nodemailer
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialise le transporteur Nodemailer avec la config .env
   */
  async initialize() {
    try {
      // Vérifier que les variables d'environnement sont définies
      if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.warn('⚠️  Configuration email incomplète dans .env');
        console.warn('   Variables requises: EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD');
        this.initialized = false;
        return false;
      }

      // Configuration du transporteur
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true', // true pour port 465, false pour 587
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false // Permet les certificats auto-signés
        }
      });

      // Vérifier la connexion
      await this.transporter.verify();
      console.log('✅ Service email initialisé avec succès');
      console.log(`   Host: ${process.env.EMAIL_HOST}`);
      console.log(`   User: ${process.env.EMAIL_USER}`);
      console.log(`   Port: ${process.env.EMAIL_PORT || 587}`);

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation du service email:', error.message);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Teste la configuration email
   */
  async testConnection() {
    if (!this.transporter) {
      await this.initialize();
    }

    if (!this.transporter) {
      throw new Error('Service email non initialisé. Vérifiez votre configuration .env');
    }

    try {
      await this.transporter.verify();
      return {
        success: true,
        message: 'Configuration email valide',
        config: {
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT || 587,
          user: process.env.EMAIL_USER,
          secure: process.env.EMAIL_SECURE === 'true'
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Erreur de configuration email',
        error: error.message
      };
    }
  }

  /**
   * Envoie un email
   * @param {Object} options - Options d'envoi
   * @param {string} options.to - Email destinataire
   * @param {string} options.subject - Sujet de l'email
   * @param {string} options.html - Contenu HTML de l'email
   * @param {string} options.text - Contenu texte brut (optionnel)
   * @param {Array} options.attachments - Pièces jointes (optionnel)
   * @param {boolean} options.ccToSelf - Envoyer une copie à soi-même (optionnel)
   */
  async sendEmail(options) {
    // Initialiser si nécessaire
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.transporter) {
      throw new Error('Service email non initialisé. Vérifiez votre configuration .env');
    }

    const { to, subject, html, text, attachments = [], ccToSelf = false } = options;

    // Validation
    if (!to) {
      throw new Error('Email destinataire requis');
    }
    if (!subject) {
      throw new Error('Sujet requis');
    }
    if (!html && !text) {
      throw new Error('Contenu email requis (html ou text)');
    }

    // Configuration du mail
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'CRM'} <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || '', // Fallback texte brut
      attachments
    };

    // Ajouter copie à soi-même si demandé
    if (ccToSelf) {
      mailOptions.cc = process.env.EMAIL_USER;
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email envoyé avec succès à ${to}`);
      console.log(`   Message ID: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        sentTo: to,
        sentAt: new Date()
      };
    } catch (error) {
      console.error(`❌ Erreur lors de l'envoi de l'email à ${to}:`, error.message);
      throw error;
    }
  }

  /**
   * Envoie un devis par email
   */
  async sendQuoteEmail(quote, pdfBuffer, options = {}) {
    const { recipientEmail, customMessage = '', ccToSelf = false } = options;

    // Email par défaut : celui du client
    const to = recipientEmail || quote.client_email;
    if (!to) {
      throw new Error('Aucun email destinataire défini pour ce client');
    }

    // Construction du message HTML
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Votre devis ${quote.quote_number}</h2>

        <p>Bonjour ${quote.client_name || ''},</p>

        <p>Veuillez trouver ci-joint votre devis n°<strong>${quote.quote_number}</strong>.</p>

        ${customMessage ? `<div style="margin: 20px 0;">
          ${customMessage.replace(/\n/g, '<br>')}
        </div>` : ''}

        <div style="margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Montant total TTC :</strong> ${this.formatAmount(quote.total_ttc)}</p>
          <p style="margin: 5px 0;"><strong>Validité :</strong> ${quote.validity_days || 30} jours</p>
          ${quote.expiry_date ? `<p style="margin: 5px 0;"><strong>Date d'expiration :</strong> ${this.formatDate(quote.expiry_date)}</p>` : ''}
        </div>

        <p>Pour toute question, n'hésitez pas à me contacter.</p>

        ${options.signature || '<p>Cordialement</p>'}
      </div>
    `;

    // Pièce jointe PDF
    const attachments = pdfBuffer ? [{
      filename: `Devis_${quote.quote_number}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }] : [];

    // Envoi
    return await this.sendEmail({
      to,
      subject: `Devis ${quote.quote_number}`,
      html,
      text: `Bonjour, veuillez trouver ci-joint votre devis ${quote.quote_number}.`,
      attachments,
      ccToSelf
    });
  }

  /**
   * Envoie une facture par email
   */
  async sendInvoiceEmail(invoice, pdfBuffer, options = {}) {
    const { recipientEmail, customMessage = '', ccToSelf = false } = options;

    // Email par défaut : celui du client
    const to = recipientEmail || invoice.client_email;
    if (!to) {
      throw new Error('Aucun email destinataire défini pour ce client');
    }

    // Construction du message HTML
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Votre facture ${invoice.invoice_number}</h2>

        <p>Bonjour ${invoice.client_name || ''},</p>

        <p>Veuillez trouver ci-joint votre facture n°<strong>${invoice.invoice_number}</strong>.</p>

        ${customMessage ? `<div style="margin: 20px 0;">
          ${customMessage.replace(/\n/g, '<br>')}
        </div>` : ''}

        <div style="margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Montant total TTC :</strong> ${this.formatAmount(invoice.total_ttc)}</p>
          ${invoice.due_date ? `<p style="margin: 5px 0;"><strong>Date d'échéance :</strong> ${this.formatDate(invoice.due_date)}</p>` : ''}
          <p style="margin: 5px 0;"><strong>Statut :</strong> ${this.getPaymentStatusLabel(invoice.payment_status)}</p>
        </div>

        <p>Pour toute question, n'hésitez pas à me contacter.</p>

        ${options.signature || '<p>Cordialement</p>'}
      </div>
    `;

    // Pièce jointe PDF
    const attachments = pdfBuffer ? [{
      filename: `Facture_${invoice.invoice_number}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }] : [];

    // Envoi
    return await this.sendEmail({
      to,
      subject: `Facture ${invoice.invoice_number}`,
      html,
      text: `Bonjour, veuillez trouver ci-joint votre facture ${invoice.invoice_number}.`,
      attachments,
      ccToSelf
    });
  }

  /**
   * Helpers de formatage
   */
  formatAmount(amount) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  }

  formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  getPaymentStatusLabel(status) {
    const labels = {
      pending: 'En attente',
      paid: 'Payée',
      overdue: 'En retard',
      relance1: 'Relance 1',
      relance2: 'Relance 2',
      relance3: 'Mise en demeure'
    };
    return labels[status] || status;
  }

  /**
   * Envoie un rapport de maintenance par email
   */
  async sendMaintenanceReportEmail(report, options = {}) {
    const { recipientEmail, customMessage = '', ccToSelf = false } = options;

    const data = report.report_data || {};
    const to = recipientEmail || report.client_email;

    if (!to) {
      throw new Error('Aucun email destinataire défini pour ce client');
    }

    // Labels des types d'intervention
    const typeLabels = {
      'update': 'Mise à jour',
      'backup': 'Sauvegarde',
      'security': 'Sécurité',
      'maintenance': 'Maintenance',
      'support': 'Support',
      'other': 'Autre'
    };

    // Icônes des types (emoji fallback pour compatibilité email)
    const typeIcons = {
      'update': '🔄',
      'backup': '💾',
      'security': '🔒',
      'maintenance': '🔧',
      'support': '💬',
      'other': '📋'
    };

    // Formater la durée
    const formatDuration = (minutes) => {
      if (!minutes) return '-';
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return hours > 0 ? `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}` : `${mins}min`;
    };

    // Générer le tableau des interventions
    let interventionsHtml = '';
    if (data.interventions && data.interventions.length > 0) {
      interventionsHtml = data.interventions.map(i => `
        <tr>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${this.formatDate(i.completed_date || i.scheduled_date)}</td>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; background: #f3e8ff; color: #7c3aed; font-size: 12px; font-weight: 500;">
              ${typeIcons[i.type] || '📋'} ${typeLabels[i.type] || i.type}
            </span>
          </td>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${i.title}</td>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; text-align: center;">${formatDuration(i.duration_minutes)}</td>
        </tr>
      `).join('');
    } else {
      interventionsHtml = '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #9ca3af; font-style: italic;">Aucune intervention sur cette période</td></tr>';
    }

    // Déterminer le forfait mensuel
    const forfaitMensuel = report.budget || data.project?.budget || 0;

    // Construction du message HTML professionnel avec branding Pixfeed
    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width: 700px; margin: 0 auto; background: #ffffff;">

          <!-- Header avec logo Pixfeed -->
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #6366f1 50%, #8b5cf6 100%); padding: 35px 30px; text-align: center;">
            <img src="https://pixfeed.net/wp-content/uploads/2024/01/pixfeed-logo-blanc.png" alt="Pixfeed" style="height: 45px; margin-bottom: 20px;" />
            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 600; letter-spacing: -0.5px;">Rapport de Maintenance</h1>
            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">${report.project_name || data.project?.name || 'Votre site web'}</p>
            <div style="margin-top: 15px; display: inline-block; background: rgba(255,255,255,0.2); padding: 8px 20px; border-radius: 25px;">
              <span style="color: #ffffff; font-size: 14px;">📅 ${this.formatDate(report.period_start)} → ${this.formatDate(report.period_end)}</span>
            </div>
          </div>

          <!-- Contenu principal -->
          <div style="padding: 40px 35px;">

            <!-- Message d'introduction -->
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Bonjour <strong>${report.client_name || data.client?.name || ''}</strong>,
            </p>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.7; margin: 0 0 30px 0;">
              Voici le récapitulatif des interventions réalisées sur votre site durant cette période.
              Ce rapport vous permet de suivre l'ensemble des actions effectuées dans le cadre de votre forfait de maintenance.
            </p>

            ${customMessage ? `
            <div style="margin: 0 0 30px 0; padding: 20px; background: linear-gradient(135deg, #f3e8ff 0%, #ede9fe 100%); border-left: 4px solid #7c3aed; border-radius: 0 12px 12px 0;">
              <p style="margin: 0; color: #5b21b6; font-size: 14px; line-height: 1.6;">${customMessage.replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}

            <!-- Statistiques -->
            <div style="margin: 30px 0; background: #fafafa; border-radius: 16px; padding: 5px; display: flex;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="width: 33%; padding: 25px 15px; text-align: center; vertical-align: top;">
                    <div style="font-size: 36px; font-weight: 700; color: #7c3aed; line-height: 1;">${data.summary?.interventions_count || 0}</div>
                    <div style="color: #6b7280; font-size: 13px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Interventions</div>
                  </td>
                  <td style="width: 33%; padding: 25px 15px; text-align: center; vertical-align: top; border-left: 2px solid #e5e7eb; border-right: 2px solid #e5e7eb;">
                    <div style="font-size: 36px; font-weight: 700; color: #7c3aed; line-height: 1;">${formatDuration(data.summary?.total_duration_minutes || 0)}</div>
                    <div style="color: #6b7280; font-size: 13px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Temps total</div>
                  </td>
                  <td style="width: 33%; padding: 25px 15px; text-align: center; vertical-align: top;">
                    <div style="font-size: 36px; font-weight: 700; color: #10b981; line-height: 1;">${forfaitMensuel}€</div>
                    <div style="color: #6b7280; font-size: 13px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Forfait/mois</div>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Tableau des interventions -->
            <div style="margin: 35px 0;">
              <h3 style="color: #1f2937; font-size: 18px; font-weight: 600; margin: 0 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb;">
                📋 Détail des interventions
              </h3>
              <table style="width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <thead>
                  <tr style="background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);">
                    <th style="padding: 16px 12px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Date</th>
                    <th style="padding: 16px 12px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Type</th>
                    <th style="padding: 16px 12px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
                    <th style="padding: 16px 12px; text-align: center; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Durée</th>
                  </tr>
                </thead>
                <tbody>
                  ${interventionsHtml}
                </tbody>
              </table>
            </div>

            ${report.notes ? `
            <div style="margin: 30px 0; padding: 20px; background: #fef3c7; border-radius: 12px; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                <strong>📝 Note importante :</strong><br>
                ${report.notes}
              </p>
            </div>
            ` : ''}

            <!-- Message de conclusion -->
            <p style="color: #6b7280; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0;">
              Pour toute question concernant ce rapport ou votre forfait de maintenance, n'hésitez pas à me contacter directement.
            </p>

            <!-- Signature Pixfeed professionnelle -->
            <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
              <table cellpadding="0" cellspacing="0" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <tr>
                  <td style="vertical-align: top; padding-right: 20px;">
                    <img src="https://pixfeed.net/wp-content/uploads/2024/01/pixfeed-logo-couleur.png" alt="Pixfeed" style="width: 120px; height: auto;" />
                  </td>
                  <td style="vertical-align: top; border-left: 3px solid #7c3aed; padding-left: 20px;">
                    <p style="margin: 0 0 5px 0; font-size: 16px; font-weight: 600; color: #1f2937;">Marc Gueffie</p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #7c3aed; font-weight: 500;">Développeur chez Pixfeed</p>
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">
                      📞 <a href="tel:+33612345678" style="color: #6b7280; text-decoration: none;">06 12 34 56 78</a>
                    </p>
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">
                      ✉️ <a href="mailto:contact@pixfeed.fr" style="color: #6b7280; text-decoration: none;">contact@pixfeed.fr</a>
                    </p>
                    <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;">
                      🌐 <a href="https://pixfeed.net" style="color: #7c3aed; text-decoration: none; font-weight: 500;">pixfeed.net</a>
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #9ca3af; font-style: italic;">
                      "L'humain au cœur de nos solutions"
                    </p>
                  </td>
                </tr>
              </table>
            </div>

          </div>

          <!-- Footer -->
          <div style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%); padding: 25px 35px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: rgba(255,255,255,0.9); font-size: 13px;">
              Ce rapport a été généré automatiquement par votre service de maintenance Pixfeed
            </p>
            <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 12px;">
              © ${new Date().getFullYear()} Pixfeed - Tous droits réservés
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    // Envoi
    return await this.sendEmail({
      to,
      subject: `🔧 Rapport de maintenance - ${report.project_name || data.project?.name || 'Votre site'} - ${this.formatDate(report.period_start)} au ${this.formatDate(report.period_end)}`,
      html,
      text: `Rapport de maintenance Pixfeed\n\nBonjour ${report.client_name || data.client?.name || ''},\n\nVoici le récapitulatif des interventions réalisées sur votre site du ${this.formatDate(report.period_start)} au ${this.formatDate(report.period_end)}.\n\nRésumé :\n- ${data.summary?.interventions_count || 0} interventions réalisées\n- Temps total : ${formatDuration(data.summary?.total_duration_minutes || 0)}\n- Forfait mensuel : ${forfaitMensuel}€\n\nPour toute question, contactez-nous sur contact@pixfeed.fr ou au 06 12 34 56 78.\n\nCordialement,\nMarc Gueffie\nDéveloppeur chez Pixfeed\nhttps://pixfeed.net`,
      ccToSelf
    });
  }
}

// Export d'une instance unique (singleton)
const emailService = new EmailService();

module.exports = emailService;
