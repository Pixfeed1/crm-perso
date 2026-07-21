// backend/controllers/quoteController.js
const quoteModel = require('../models/quoteModel');
const emailService = require('../services/emailService');
const pdfService = require('../services/pdfService');
const SettingsModel = require('../models/settingsModel');

/**
 * Contrôleur pour la gestion des devis
 */
const quoteController = {
  /**
   * Récupérer tous les devis
   */
  getAllQuotes: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const quotes = await quoteModel.getAllQuotes(db);
      res.json(quotes);
    } catch (error) {
      console.error('Erreur lors de la récupération des devis:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer un devis spécifique
   */
  getQuoteById: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const quote = await quoteModel.getQuoteById(db, id);

      if (!quote) {
        return res.status(404).json({ message: 'Devis non trouvé' });
      }

      // Parser les items si c'est une chaîne JSON
      if (typeof quote.items === 'string') {
        quote.items = JSON.parse(quote.items);
      }

      res.json(quote);
    } catch (error) {
      console.error('Erreur lors de la récupération du devis:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer un nouveau devis
   */
  createQuote: async (req, res) => {
    const db = req.app.locals.db;
    const {
      title,
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      project_id,
      items,
      discount_type,
      discount_value,
      cgv,
      cgv_type,
      cgv_pdf,
      tva_rate,
      tva_applicable,
      tva_regime,
      payment_methods,
      payment_details,
      acompte_type,
      acompte_value,
      escompte_percent,
      escompte_days,
      validity_days,
      additional_info,
      additional_files,
      notes
    } = req.body;

    // Validation
    if (!client_name) {
      return res.status(400).json({ message: 'Le nom du client est requis' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Au moins un article est requis' });
    }

    try {
      const result = await quoteModel.createQuote(db, {
        title,
        client_id,
        client_name,
        client_email,
        client_address,
        client_siret,
        project_id,
        items,
        discount_type,
        discount_value,
        cgv,
        cgv_type,
        cgv_pdf,
        tva_rate,
        tva_applicable,
        tva_regime,
        payment_methods,
        payment_details,
        acompte_type,
        acompte_value,
        escompte_percent,
        escompte_days,
        validity_days,
        additional_info,
        additional_files,
        notes
      });

      res.status(201).json({
        message: 'Devis créé avec succès',
        id: result.id,
        quote_number: result.quote_number
      });
    } catch (error) {
      console.error('Erreur lors de la création du devis:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({
        message: 'Erreur serveur',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Mettre à jour un devis
   */
  updateQuote: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      title,
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      project_id,
      status,
      items,
      discount_type,
      discount_value,
      cgv,
      cgv_type,
      cgv_pdf,
      tva_rate,
      tva_applicable,
      tva_regime,
      payment_methods,
      payment_details,
      acompte_type,
      acompte_value,
      escompte_percent,
      escompte_days,
      validity_days,
      additional_info,
      additional_files,
      notes
    } = req.body;

    // Validation
    if (!client_name) {
      return res.status(400).json({ message: 'Le nom du client est requis' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Au moins un article est requis' });
    }

    try {
      const result = await quoteModel.updateQuote(db, id, {
        title,
        client_id,
        client_name,
        client_email,
        client_address,
        client_siret,
        project_id,
        status,
        items,
        discount_type,
        discount_value,
        cgv,
        cgv_type,
        cgv_pdf,
        tva_rate,
        tva_applicable,
        tva_regime,
        payment_methods,
        payment_details,
        acompte_type,
        acompte_value,
        escompte_percent,
        escompte_days,
        validity_days,
        additional_info,
        additional_files,
        notes
      });

      if (result.changes === 0) {
        return res.status(404).json({ message: 'Devis non trouvé' });
      }

      res.json({ message: 'Devis mis à jour avec succès', id });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du devis:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Supprimer un devis
   */
  deleteQuote: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const result = await quoteModel.deleteQuote(db, id);

      if (result.changes === 0) {
        return res.status(404).json({ message: 'Devis non trouvé' });
      }

      res.json({ message: 'Devis supprimé avec succès' });
    } catch (error) {
      console.error('Erreur lors de la suppression du devis:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Changer le statut d'un devis
   */
  updateQuoteStatus: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { status } = req.body;

    // Validation
    const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Statut invalide',
        validStatuses
      });
    }

    try {
      const result = await quoteModel.updateQuoteStatus(db, id, status);

      if (result.changes === 0) {
        return res.status(404).json({ message: 'Devis non trouvé' });
      }

      res.json({
        message: 'Statut du devis mis à jour avec succès',
        id,
        status
      });
    } catch (error) {
      console.error('Erreur lors du changement de statut:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Envoyer un devis par email
   */
  sendQuote: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { recipientEmail, customMessage, ccToSelf } = req.body;

    try {
      // Récupérer le devis
      const quote = await quoteModel.getQuoteById(db, id);
      if (!quote) {
        return res.status(404).json({ message: 'Devis non trouvé' });
      }

      // Récupérer les paramètres entreprise
      const settingsModel = new SettingsModel(db);
      const companySettings = await settingsModel.getSettings();

      // Récupérer les détails du régime TVA si présent
      let tvaRegime = null;
      if (quote.tva_regime) {
        const tvaQuery = 'SELECT * FROM tva_regimes WHERE code = $1';
        const tvaResult = await new Promise((resolve, reject) => {
          db.pool.query(tvaQuery, [quote.tva_regime], (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        tvaRegime = tvaResult.rows[0] || null;
      }

      // Générer le PDF
      // PDF en pièce jointe : si Chrome/Puppeteer est indisponible sur le serveur, on
      // n'échoue PAS l'envoi — l'email part sans PJ (l'attachement est optionnel).
      let pdfBuffer = null;
      try {
        pdfBuffer = await pdfService.generateQuotePDF(quote, companySettings, tvaRegime);
      } catch (pdfErr) {
        console.error('[Quote] PDF non généré (email envoyé sans pièce jointe):', pdfErr.message);
      }

      // Récupérer la signature email
      const signature = companySettings.email_signature || '';

      // Envoyer l'email
      const result = await emailService.sendQuoteEmail(quote, pdfBuffer, {
        recipientEmail,
        customMessage,
        ccToSelf,
        signature
      });

      // Mettre à jour l'historique d'envoi
      await quoteModel.updateSendHistory(db, id, result.sentTo);

      // Mettre à jour le statut si c'était 'draft'
      if (quote.status === 'draft') {
        await quoteModel.updateQuoteStatus(db, id, 'sent');
      }

      res.json({
        success: true,
        message: `Devis envoyé avec succès à ${result.sentTo}`,
        sentAt: result.sentAt,
        messageId: result.messageId
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du devis:', error);
      res.status(500).json({
        message: 'Erreur lors de l\'envoi de l\'email',
        error: error.message
      });
    }
  },

  /**
   * Signer un devis et optionnellement créer une facture
   * POST /api/quotes/:id/sign
   */
  signQuote: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { signed_by, signature_data, create_invoice = false } = req.body;

    try {
      // Valider les données
      if (!signed_by || !signature_data) {
        return res.status(400).json({
          message: 'Le nom du signataire et la signature sont requis'
        });
      }

      // Récupérer le devis
      const quote = await quoteModel.getQuoteById(db, id);
      if (!quote) {
        return res.status(404).json({ message: 'Devis non trouvé' });
      }

      // Vérifier que le devis n'est pas déjà signé
      if (quote.signed_at) {
        return res.status(400).json({
          message: 'Ce devis a déjà été signé',
          signed_at: quote.signed_at,
          signed_by: quote.signed_by
        });
      }

      // Signer le devis
      const signedQuote = await quoteModel.signQuote(db, id, {
        signed_by,
        signature_data
      });

      // Créer une facture si demandé
      let invoice = null;
      if (create_invoice) {
        const invoiceModel = require('../models/invoiceModel');
        invoice = await invoiceModel.createInvoiceFromQuote(db, id);
      }

      res.status(200).json({
        message: 'Devis signé avec succès',
        quote: signedQuote,
        invoice: invoice || undefined
      });
    } catch (error) {
      console.error('Erreur signature devis:', error);
      res.status(500).json({
        message: 'Erreur lors de la signature du devis',
        error: error.message
      });
    }
  }
};

module.exports = quoteController;
