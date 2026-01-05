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
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        tls: {
          rejectUnauthorized: false
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
   * Génère la signature email par défaut
   */
  getDefaultSignature() {
    return `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #374151;">
  <tr>
    <td valign="top" style="padding-right: 20px; border-right: 3px solid #6366f1;">
      <img src="https://pixfeed.net/wp-content/uploads/2025/04/logo.png" alt="Pixfeed" width="70" style="display: block;">
      <p style="margin: 10px 0 0 0; font-size: 10px; color: #9ca3af; font-style: italic; max-width: 70px; line-height: 1.3;">L'humain au cœur de nos solutions</p>
    </td>
    <td valign="top" style="padding-left: 20px;">
      <p style="margin: 0 0 2px 0; font-size: 16px; font-weight: 600; color: #111827;">Marc Gueffie</p>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #6366f1; font-weight: 500;">Chargé de Projet · Pixfeed</p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">📞 <a href="tel:0645373930" style="color: #6b7280; text-decoration: none;">06.45.37.39.30</a></p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">✉️ <a href="mailto:mgueffie@pixfeed.net" style="color: #6b7280; text-decoration: none;">mgueffie@pixfeed.net</a></p>
      <p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280;">🌐 <a href="https://pixfeed.net" style="color: #6366f1; text-decoration: none; font-weight: 500;">pixfeed.net</a></p>
      <p style="margin: 0;">
        <a href="https://www.linkedin.com/company/pixfeed/" style="text-decoration: none; margin-right: 8px;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/linkedinmail.png" alt="LinkedIn" width="20" height="20" style="vertical-align: middle;"></a>
        <a href="https://www.facebook.com/Pixfeed" style="text-decoration: none;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/fasebookmail.png" alt="Facebook" width="20" height="20" style="vertical-align: middle;"></a>
      </p>
    </td>
  </tr>
</table>`;
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
      text: text || '',
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
    const { recipientEmail, customMessage = '', ccToSelf = false, signature = null } = options;

    const to = recipientEmail || quote.client_email;
    if (!to) {
      throw new Error('Aucun email destinataire défini pour ce client');
    }

    // Utiliser la signature fournie ou la signature par défaut
    const emailSignature = signature || this.getDefaultSignature();

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">
        <p style="font-size: 15px; line-height: 1.6;">Bonjour ${quote.client_name || ''},</p>

        <p style="font-size: 15px; line-height: 1.6;">Veuillez trouver ci-joint votre devis n°<strong>${quote.quote_number}</strong>.</p>

        ${customMessage ? `<div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 8px; font-size: 14px; line-height: 1.6;">${customMessage.replace(/\n/g, '<br>')}</div>` : ''}

        <div style="margin: 24px 0; padding: 16px; background: #f0f9ff; border-left: 4px solid #6366f1; border-radius: 0 8px 8px 0;">
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Montant total TTC :</strong> ${this.formatAmount(quote.total_ttc)}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Validité :</strong> ${quote.validity_days || 30} jours</p>
          ${quote.expiry_date ? `<p style="margin: 0; font-size: 14px;"><strong>Date d'expiration :</strong> ${this.formatDate(quote.expiry_date)}</p>` : ''}
        </div>

        <p style="font-size: 15px; line-height: 1.6;">Pour toute question, n'hésitez pas à me contacter.</p>

        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Bien cordialement,</p>

        ${emailSignature}
      </div>
    `;

    const attachments = pdfBuffer ? [{
      filename: `Devis_${quote.quote_number}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }] : [];

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
    const { recipientEmail, customMessage = '', ccToSelf = false, signature = null } = options;

    const to = recipientEmail || invoice.client_email;
    if (!to) {
      throw new Error('Aucun email destinataire défini pour ce client');
    }

    const emailSignature = signature || this.getDefaultSignature();

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">
        <p style="font-size: 15px; line-height: 1.6;">Bonjour ${invoice.client_name || ''},</p>

        <p style="font-size: 15px; line-height: 1.6;">Veuillez trouver ci-joint votre facture n°<strong>${invoice.invoice_number}</strong>.</p>

        ${customMessage ? `<div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 8px; font-size: 14px; line-height: 1.6;">${customMessage.replace(/\n/g, '<br>')}</div>` : ''}

        <div style="margin: 24px 0; padding: 16px; background: #f0f9ff; border-left: 4px solid #6366f1; border-radius: 0 8px 8px 0;">
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Montant total TTC :</strong> ${this.formatAmount(invoice.total_ttc)}</p>
          ${invoice.due_date ? `<p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Date d'échéance :</strong> ${this.formatDate(invoice.due_date)}</p>` : ''}
          <p style="margin: 0; font-size: 14px;"><strong>Statut :</strong> ${this.getPaymentStatusLabel(invoice.payment_status)}</p>
        </div>

        <p style="font-size: 15px; line-height: 1.6;">Pour toute question, n'hésitez pas à me contacter.</p>

        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Bien cordialement,</p>

        ${emailSignature}
      </div>
    `;

    const attachments = pdfBuffer ? [{
      filename: `Facture_${invoice.invoice_number}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }] : [];

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
   * Envoie un rapport de maintenance par email avec PDF en pièce jointe
   */
  async sendMaintenanceReportEmail(report, options = {}) {
    const { recipientEmail, customMessage = '', ccToSelf = false, pdfBuffer = null, pdfFileName = null, signature = null } = options;

    const data = report.report_data || {};
    const to = recipientEmail || report.client_email;

    if (!to) {
      throw new Error('Aucun email destinataire défini pour ce client');
    }

    const emailSignature = signature || this.getDefaultSignature();

    // Labels des types d'intervention
    const typeLabels = {
      'update': 'Mise à jour',
      'backup': 'Sauvegarde',
      'security': 'Sécurité',
      'maintenance': 'Maintenance',
      'support': 'Support',
      'other': 'Autre'
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
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px;">${this.formatDate(i.completed_date || i.scheduled_date)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; background: #ede9fe; color: #6366f1; font-size: 11px; font-weight: 500;">
              ${typeLabels[i.type] || i.type}
            </span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 13px;">${i.title}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; text-align: center; font-size: 13px;">${formatDuration(i.duration_minutes)}</td>
        </tr>
      `).join('');
    } else {
      interventionsHtml = '<tr><td colspan="4" style="padding: 24px; text-align: center; color: #9ca3af; font-style: italic;">Aucune intervention sur cette période</td></tr>';
    }

    const forfaitMensuel = report.budget || data.project?.budget || 0;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; color: #374151;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <img src="https://pixfeed.net/wp-content/uploads/2025/04/logo.png" alt="Pixfeed" height="40" style="margin-bottom: 16px;">
          <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Rapport de Maintenance</h1>
          <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 15px;">${report.project_name || data.project?.name || 'Votre site web'}</p>
          <p style="margin: 12px 0 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">📅 ${this.formatDate(report.period_start)} → ${this.formatDate(report.period_end)}</p>
        </div>

        <!-- Contenu -->
        <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none;">

          <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
            Bonjour <strong>${report.client_name || data.client?.name || ''}</strong>,
          </p>
          <p style="font-size: 14px; line-height: 1.7; color: #6b7280; margin: 0 0 24px 0;">
            Voici le récapitulatif des interventions réalisées sur votre site durant cette période.
          </p>

          ${customMessage ? `
          <div style="margin: 0 0 24px 0; padding: 16px; background: #f5f3ff; border-left: 4px solid #6366f1; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; color: #5b21b6; font-size: 14px; line-height: 1.6;">${customMessage.replace(/\n/g, '<br>')}</p>
          </div>
          ` : ''}

          <!-- Stats -->
          <table style="width: 100%; margin: 24px 0; background: #f9fafb; border-radius: 12px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width: 33%; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: 700; color: #6366f1;">${data.summary?.interventions_count || 0}</div>
                <div style="color: #6b7280; font-size: 12px; margin-top: 4px; text-transform: uppercase;">Interventions</div>
              </td>
              <td style="width: 33%; padding: 20px; text-align: center; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
                <div style="font-size: 28px; font-weight: 700; color: #6366f1;">${formatDuration(data.summary?.total_duration_minutes || 0)}</div>
                <div style="color: #6b7280; font-size: 12px; margin-top: 4px; text-transform: uppercase;">Temps total</div>
              </td>
              <td style="width: 33%; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: 700; color: #10b981;">${forfaitMensuel}€</div>
                <div style="color: #6b7280; font-size: 12px; margin-top: 4px; text-transform: uppercase;">Forfait/mois</div>
              </td>
            </tr>
          </table>

          <!-- Tableau interventions -->
          <h3 style="color: #111827; font-size: 16px; font-weight: 600; margin: 32px 0 16px 0;">📋 Détail des interventions</h3>
          <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb;">Date</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb;">Type</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb;">Description</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb;">Durée</th>
              </tr>
            </thead>
            <tbody>
              ${interventionsHtml}
            </tbody>
          </table>

          ${report.notes ? `
          <div style="margin: 24px 0; padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
              <strong>📝 Note :</strong> ${report.notes}
            </p>
          </div>
          ` : ''}

          <p style="font-size: 14px; line-height: 1.7; color: #6b7280; margin: 24px 0;">
            Pour toute question concernant ce rapport, n'hésitez pas à me contacter.
          </p>

          <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">Bien cordialement,</p>

          ${emailSignature}
        </div>

        <!-- Footer -->
        <div style="background: #1f2937; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
          <p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 12px;">
            Ce rapport a été généré automatiquement par votre service de maintenance Pixfeed
          </p>
        </div>
      </div>
    `;

    const attachments = [];
    if (pdfBuffer && pdfFileName) {
      attachments.push({
        filename: pdfFileName,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    return await this.sendEmail({
      to,
      subject: `🔧 Rapport de maintenance - ${report.project_name || data.project?.name || 'Votre site'} - ${this.formatDate(report.period_start)} au ${this.formatDate(report.period_end)}`,
      html,
      text: `Rapport de maintenance Pixfeed\n\nBonjour ${report.client_name || ''},\n\nVoici le récapitulatif des interventions du ${this.formatDate(report.period_start)} au ${this.formatDate(report.period_end)}.\n\n- ${data.summary?.interventions_count || 0} interventions\n- Temps total : ${formatDuration(data.summary?.total_duration_minutes || 0)}\n\nCordialement,\nMarc Gueffie - Pixfeed`,
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
}

// Export singleton
const emailService = new EmailService();
module.exports = emailService;
