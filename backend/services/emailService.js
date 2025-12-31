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
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${this.formatDate(i.completed_date || i.scheduled_date)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${typeLabels[i.type] || i.type}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${i.title}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formatDuration(i.duration_minutes)}</td>
        </tr>
      `).join('');
    } else {
      interventionsHtml = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #6b7280;">Aucune intervention sur cette période</td></tr>';
    }

    // Construction du message HTML
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0 0 10px 0; font-size: 24px;">Rapport de maintenance</h1>
          <p style="margin: 0; opacity: 0.9;">${report.project_name || data.project?.name || 'Votre site'}</p>
          <p style="margin: 10px 0 0 0; font-size: 14px;">
            Période du ${this.formatDate(report.period_start)} au ${this.formatDate(report.period_end)}
          </p>
        </div>

        <div style="padding: 30px; background: #ffffff;">
          <p>Bonjour ${report.client_name || data.client?.name || ''},</p>
          <p>Voici le récapitulatif des interventions réalisées sur votre site durant cette période.</p>

          ${customMessage ? `<div style="margin: 20px 0; padding: 15px; background: #f3f4f6; border-radius: 8px;">
            ${customMessage.replace(/\n/g, '<br>')}
          </div>` : ''}

          <table style="width: 100%; border-collapse: collapse; margin: 25px 0;">
            <tr>
              <td style="width: 33%; background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #8b5cf6;">${data.summary?.interventions_count || 0}</div>
                <div style="color: #6b7280; font-size: 14px; margin-top: 5px;">Interventions</div>
              </td>
              <td style="width: 33%; background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #8b5cf6;">${formatDuration(data.summary?.total_duration_minutes || 0)}</div>
                <div style="color: #6b7280; font-size: 14px; margin-top: 5px;">Temps total</div>
              </td>
              <td style="width: 33%; background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #8b5cf6;">${this.formatAmount(report.budget || data.project?.budget)}</div>
                <div style="color: #6b7280; font-size: 14px; margin-top: 5px;">Forfait</div>
              </td>
            </tr>
          </table>

          <h3 style="color: #374151; margin-bottom: 15px;">Détail des interventions</h3>
          <table style="width: 100%; border-collapse: collapse; background: #ffffff;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Date</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Type</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Description</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Durée</th>
              </tr>
            </thead>
            <tbody>
              ${interventionsHtml}
            </tbody>
          </table>

          ${report.notes ? `<div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; color: #92400e;">
            <strong>Note :</strong> ${report.notes}
          </div>` : ''}

          <p style="margin-top: 30px;">Pour toute question, n'hésitez pas à nous contacter.</p>
          <p>Cordialement</p>
        </div>

        <div style="background: #f9fafb; padding: 20px 30px; text-align: center; color: #6b7280; font-size: 14px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0;">Ce rapport a été généré automatiquement par votre service de maintenance.</p>
        </div>
      </div>
    `;

    // Envoi
    return await this.sendEmail({
      to,
      subject: `Rapport de maintenance - ${report.project_name || data.project?.name || 'Votre site'} - ${this.formatDate(report.period_start)} au ${this.formatDate(report.period_end)}`,
      html,
      text: `Rapport de maintenance du ${this.formatDate(report.period_start)} au ${this.formatDate(report.period_end)}. ${data.summary?.interventions_count || 0} interventions réalisées.`,
      ccToSelf
    });
  }
}

// Export d'une instance unique (singleton)
const emailService = new EmailService();

module.exports = emailService;
