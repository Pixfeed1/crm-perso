// backend/controllers/clientController.js
const clientModel = require('../models/clientModel');
const multer = require('multer');

// Configuration multer pour les pièces jointes email
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB par fichier
    files: 10 // Max 10 fichiers
  }
});

/**
 * Contrôleur pour la gestion des clients (leads convertis)
 */
const clientController = {
  /**
   * Récupérer tous les clients
   */
  getAllClients: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const clients = await clientModel.getAllClients(db);
      res.json(clients);
    } catch (error) {
      console.error('Erreur lors de la récupération des clients:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer un client spécifique avec ses projets et revenus associés
   */
  getClientById: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const client = await clientModel.getClientById(db, id);

      if (!client) {
        return res.status(404).json({ message: 'Client non trouvé' });
      }

      res.json(client);
    } catch (error) {
      console.error('Erreur lors de la récupération du client:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer un nouveau client
   */
  createClient: async (req, res) => {
    const db = req.app.locals.db;
    const {
      lead_id, name, company, type, email, phone, address,
      website, industry, source, contract_start_date,
      lifetime_value, notes, tags, status
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Le nom est requis' });
    }

    try {
      // Convertir les chaînes vides en NULL pour les champs de date (PostgreSQL)
      const sanitizedData = {
        lead_id,
        name,
        company,
        type,
        email,
        phone,
        address,
        website,
        industry,
        source,
        contract_start_date: contract_start_date === '' ? null : contract_start_date,
        lifetime_value,
        notes,
        tags,
        status
      };

      const client = await clientModel.createClient(db, sanitizedData);

      res.status(201).json(client);
    } catch (error) {
      console.error('Erreur lors de la création du client:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Convertir un lead en client
   */
  convertFromLead: async (req, res) => {
    const db = req.app.locals.db;
    const { leadId } = req.params;
    const { contract_start_date, lifetime_value, notes } = req.body;

    try {
      const client = await clientModel.convertFromLead(db, leadId, {
        contract_start_date,
        lifetime_value,
        notes
      });

      res.status(201).json({
        message: 'Lead converti en client avec succès',
        client
      });
    } catch (error) {
      console.error('Erreur lors de la conversion du lead en client:', error);

      // Gestion des erreurs spécifiques
      if (error.message === 'Lead non trouvé') {
        return res.status(404).json({ message: error.message });
      }
      if (error.message === 'Ce lead a déjà été converti en client') {
        return res.status(400).json({ message: error.message });
      }

      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour un client existant
   */
  updateClient: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      name, company, type, email, phone, address,
      website, industry, source, contract_start_date,
      lifetime_value, notes, tags, status
    } = req.body;

    try {
      // Vérifier si le client existe
      const existingClient = await clientModel.checkClientExists(db, id);
      if (!existingClient) {
        return res.status(404).json({ message: 'Client non trouvé' });
      }

      // Convertir les chaînes vides en NULL pour les champs de date (PostgreSQL)
      const sanitizedData = {
        name,
        company,
        type,
        email,
        phone,
        address,
        website,
        industry,
        source,
        contract_start_date: contract_start_date === '' ? null : contract_start_date,
        lifetime_value,
        notes,
        tags,
        status
      };

      const updatedClient = await clientModel.updateClient(db, id, sanitizedData);

      res.json(updatedClient);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du client:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Supprimer un client
   */
  deleteClient: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      // Vérifier si le client existe
      const existingClient = await clientModel.checkClientExists(db, id);
      if (!existingClient) {
        return res.status(404).json({ message: 'Client non trouvé' });
      }

      await clientModel.deleteClient(db, id);
      res.json({ message: 'Client supprimé avec succès' });
    } catch (error) {
      console.error('Erreur lors de la suppression du client:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les statistiques des clients
   */
  getClientStats: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const stats = await clientModel.getClientStats(db);
      res.json(stats);
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Envoyer un email à un client
   */
  sendEmail: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { to, subject, message, client_name, company } = req.body;

    try {
      // Validation
      if (!to || !subject || !message) {
        return res.status(400).json({
          message: 'Destinataire, objet et message sont requis'
        });
      }

      // Vérifier que le client existe
      const client = await clientModel.getClientById(db, id);
      if (!client) {
        return res.status(404).json({ message: 'Client non trouvé' });
      }

      // Vérifier que l'email correspond
      if (client.email !== to) {
        return res.status(400).json({
          message: 'L\'adresse email ne correspond pas au client'
        });
      }

      // Charger les paramètres SMTP depuis la base de données
      const settingsResult = await db.query(
        'SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from_email, smtp_from_name FROM company_settings LIMIT 1'
      );

      if (!settingsResult.rows || settingsResult.rows.length === 0) {
        return res.status(500).json({
          message: 'Configuration SMTP non trouvée. Veuillez configurer vos paramètres d\'envoi d\'emails.'
        });
      }

      const settings = settingsResult.rows[0];

      // Vérifier que la configuration SMTP est complète
      if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
        return res.status(500).json({
          message: 'Configuration SMTP incomplète. Veuillez configurer vos paramètres SMTP dans les réglages.'
        });
      }

      // Configurer nodemailer
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: settings.smtp_port || 587,
        secure: settings.smtp_secure || false,
        auth: {
          user: settings.smtp_user,
          pass: settings.smtp_pass
        }
      });

      // Construire le HTML de l'email
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .message { white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="message">${message.replace(/\n/g, '<br>')}</div>
          </div>
        </body>
        </html>
      `;

      // Préparer les pièces jointes
      const attachments = [];
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          attachments.push({
            filename: file.originalname,
            content: file.buffer,
            contentType: file.mimetype
          });
        });
      }

      // Envoyer l'email
      const mailOptions = {
        from: `"${settings.smtp_from_name || 'CRM'}" <${settings.smtp_from_email || settings.smtp_user}>`,
        to: to,
        subject: subject,
        text: message,
        html: htmlContent
      };

      // Ajouter les pièces jointes si elles existent
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      await transporter.sendMail(mailOptions);

      res.json({
        success: true,
        message: 'Email envoyé avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email:', error);
      res.status(500).json({
        message: 'Erreur lors de l\'envoi de l\'email',
        error: error.message
      });
    }
  },

  /**
   * Envoyer un email générique (sans client requis)
   */
  sendGenericEmail: async (req, res) => {
    const db = req.app.locals.db;
    const { to, subject, message } = req.body;

    try {
      // Validation
      if (!to || !subject || !message) {
        return res.status(400).json({
          message: 'Destinataire, objet et message sont requis'
        });
      }

      // Charger les paramètres SMTP depuis la base de données OU le .env
      // Support des deux formats: EMAIL_* et SMTP_*
      let smtpConfig = {
        host: process.env.EMAIL_HOST || process.env.SMTP_HOST,
        port: parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587,
        secure: process.env.EMAIL_USE_SSL === 'true' || process.env.SMTP_SECURE === 'true',
        user: process.env.EMAIL_USER || process.env.SMTP_USER,
        pass: process.env.EMAIL_PASSWORD || process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
        from_email: process.env.EMAIL_USER || process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        from_name: process.env.EMAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'CRM Pixfeed'
      };

      // Essayer de charger depuis la base de données (priorité)
      let emailSignature = '';
      try {
        const settingsResult = await db.pool.query(
          'SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from_email, smtp_from_name, email_signature FROM company_settings LIMIT 1'
        );
        if (settingsResult.rows && settingsResult.rows.length > 0) {
          const dbSettings = settingsResult.rows[0];
          // Utiliser les valeurs de la DB si elles existent
          if (dbSettings.smtp_host) smtpConfig.host = dbSettings.smtp_host;
          if (dbSettings.smtp_port) smtpConfig.port = dbSettings.smtp_port;
          if (dbSettings.smtp_secure !== null) smtpConfig.secure = dbSettings.smtp_secure;
          if (dbSettings.smtp_user) smtpConfig.user = dbSettings.smtp_user;
          if (dbSettings.smtp_pass) smtpConfig.pass = dbSettings.smtp_pass;
          if (dbSettings.smtp_from_email) smtpConfig.from_email = dbSettings.smtp_from_email;
          if (dbSettings.smtp_from_name) smtpConfig.from_name = dbSettings.smtp_from_name;
          if (dbSettings.email_signature) emailSignature = dbSettings.email_signature;
        }
      } catch (dbError) {
        console.log('Pas de config SMTP en base, utilisation du .env');
      }

      // Vérifier que la configuration SMTP est complète
      if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
        return res.status(500).json({
          message: 'Configuration SMTP incomplète. Configurez SMTP_HOST, SMTP_USER et SMTP_PASS dans le .env ou dans les réglages.'
        });
      }

      // Configurer nodemailer
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass
        }
      });

      // Construire le HTML de l'email avec signature
      const signatureHtml = emailSignature ? `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          ${emailSignature}
        </div>
      ` : '';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .message { white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="message">${message.replace(/\n/g, '<br>')}</div>
            ${signatureHtml}
          </div>
        </body>
        </html>
      `;

      // Envoyer l'email
      const mailOptions = {
        from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
        to: to,
        subject: subject,
        text: message,
        html: htmlContent
      };

      await transporter.sendMail(mailOptions);

      res.json({
        success: true,
        message: 'Email envoyé avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email:', error);
      res.status(500).json({
        message: 'Erreur lors de l\'envoi de l\'email',
        error: error.message
      });
    }
  }
};

module.exports = {
  ...clientController,
  upload // Export du middleware multer
};
