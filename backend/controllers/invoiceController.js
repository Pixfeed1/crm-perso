// backend/controllers/invoiceController.js
const invoiceModel = require('../models/invoiceModel');
const emailService = require('../services/emailService');
const pdfService = require('../services/pdfService');
const SettingsModel = require('../models/settingsModel');

/**
 * Contrôleur pour la gestion des factures
 */
const invoiceController = {
  /**
   * Récupérer toutes les factures
   */
  getAllInvoices: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const invoices = await invoiceModel.getAllInvoices(db);
      res.json(invoices);
    } catch (error) {
      console.error('Erreur lors de la récupération des factures:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer une facture spécifique
   */
  getInvoiceById: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const invoice = await invoiceModel.getInvoiceById(db, id);

      if (!invoice) {
        return res.status(404).json({ message: 'Facture non trouvée' });
      }

      // Parser les items si c'est une chaîne JSON
      if (typeof invoice.items === 'string') {
        invoice.items = JSON.parse(invoice.items);
      }

      res.json(invoice);
    } catch (error) {
      console.error('Erreur lors de la récupération de la facture:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les factures impayées
   */
  getUnpaidInvoices: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const invoices = await invoiceModel.getUnpaidInvoices(db);
      res.json(invoices);
    } catch (error) {
      console.error('Erreur lors de la récupération des factures impayées:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer une nouvelle facture
   */
  createInvoice: async (req, res) => {
    const db = req.app.locals.db;
    const {
      quote_id,
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      items,
      cgv,
      cgv_type,
      cgv_pdf,
      tva_rate,
      tva_applicable,
      acompte_type,
      acompte_value,
      escompte_percent,
      escompte_days,
      payment_terms_days,
      notes,
      payment_details
    } = req.body;

    // Validation
    if (!client_name) {
      return res.status(400).json({ message: 'Le nom du client est requis' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Au moins un article est requis' });
    }

    try {
      const result = await invoiceModel.createInvoice(db, {
        quote_id,
        client_id,
        client_name,
        client_email,
        client_address,
        client_siret,
        items,
        cgv,
        cgv_type,
        cgv_pdf,
        tva_rate,
        tva_applicable,
        acompte_type,
        acompte_value,
        escompte_percent,
        escompte_days,
        payment_terms_days,
        notes,
        payment_details
      });

      res.status(201).json({
        message: 'Facture créée avec succès',
        id: result.id,
        invoice_number: result.invoice_number
      });
    } catch (error) {
      console.error('Erreur lors de la création de la facture:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer une facture à partir d'un devis
   */
  createInvoiceFromQuote: async (req, res) => {
    const db = req.app.locals.db;
    const { quoteId } = req.params;

    try {
      const result = await invoiceModel.createInvoiceFromQuote(db, quoteId);

      res.status(201).json({
        message: 'Facture créée depuis le devis avec succès',
        id: result.id,
        invoice_number: result.invoice_number
      });
    } catch (error) {
      console.error('Erreur lors de la création de facture depuis devis:', error);
      if (error.message === 'Devis introuvable') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour une facture
   */
  updateInvoice: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      status,
      payment_status,
      items,
      cgv,
      cgv_type,
      cgv_pdf,
      tva_rate,
      tva_applicable,
      acompte_type,
      acompte_value,
      escompte_percent,
      escompte_days,
      payment_terms_days,
      notes,
      payment_details
    } = req.body;

    // Validation
    if (!client_name) {
      return res.status(400).json({ message: 'Le nom du client est requis' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Au moins un article est requis' });
    }

    try {
      const result = await invoiceModel.updateInvoice(db, id, {
        client_id,
        client_name,
        client_email,
        client_address,
        client_siret,
        status,
        payment_status,
        items,
        cgv,
        cgv_type,
        cgv_pdf,
        tva_rate,
        tva_applicable,
        acompte_type,
        acompte_value,
        escompte_percent,
        escompte_days,
        payment_terms_days,
        notes,
        payment_details
      });

      if (result.changes === 0) {
        return res.status(404).json({ message: 'Facture non trouvée' });
      }

      res.json({ message: 'Facture mise à jour avec succès', id });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la facture:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Marquer une facture comme payée
   */
  markAsPaid: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const result = await invoiceModel.markInvoiceAsPaid(db, id);

      if (result.changes === 0) {
        return res.status(404).json({ message: 'Facture non trouvée' });
      }

      res.json({
        message: 'Facture marquée comme payée avec succès',
        id,
        payment_status: 'paid'
      });
    } catch (error) {
      console.error('Erreur lors du marquage de paiement:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour le statut de paiement et le compteur de relances
   */
  updatePaymentStatus: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { payment_status, reminder_count } = req.body;

    // Validation
    const validStatuses = ['pending', 'overdue', 'relance1', 'relance2', 'relance3', 'paid'];
    if (!payment_status || !validStatuses.includes(payment_status)) {
      return res.status(400).json({
        message: 'Statut de paiement invalide',
        validStatuses
      });
    }

    try {
      const result = await invoiceModel.updatePaymentStatus(db, id, payment_status, reminder_count || 0);

      if (result.changes === 0) {
        return res.status(404).json({ message: 'Facture non trouvée' });
      }

      res.json({
        message: 'Statut de paiement mis à jour avec succès',
        id,
        payment_status,
        reminder_count
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut de paiement:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Supprimer une facture
   */
  deleteInvoice: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const result = await invoiceModel.deleteInvoice(db, id);

      if (result.changes === 0) {
        return res.status(404).json({ message: 'Facture non trouvée' });
      }

      res.json({ message: 'Facture supprimée avec succès' });
    } catch (error) {
      console.error('Erreur lors de la suppression de la facture:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Envoyer une facture par email
   */
  sendInvoice: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { recipientEmail, customMessage, ccToSelf } = req.body;

    try {
      // Récupérer la facture
      const invoice = await invoiceModel.getInvoiceById(db, id);
      if (!invoice) {
        return res.status(404).json({ message: 'Facture non trouvée' });
      }

      // Récupérer les paramètres entreprise pour le PDF et la signature
      const settingsModel = new SettingsModel(db);
      const companySettings = await settingsModel.getSettings();

      // Récupérer les détails du régime TVA si présent
      let tvaRegime = null;
      if (invoice.tva_regime) {
        const tvaQuery = 'SELECT * FROM tva_regimes WHERE code = $1';
        const tvaResult = await new Promise((resolve, reject) => {
          db.pool.query(tvaQuery, [invoice.tva_regime], (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        tvaRegime = tvaResult.rows[0] || null;
      }

      // Générer le PDF
      const pdfBuffer = await pdfService.generateInvoicePDF(invoice, companySettings, tvaRegime);

      // Récupérer la signature email depuis les paramètres
      const signature = companySettings.email_signature || '';

      // Envoyer l'email
      const result = await emailService.sendInvoiceEmail(invoice, pdfBuffer, {
        recipientEmail,
        customMessage,
        ccToSelf,
        signature
      });

      // Mettre à jour l'historique d'envoi
      await invoiceModel.updateSendHistory(db, id, result.sentTo);

      res.json({
        success: true,
        message: `Facture envoyée avec succès à ${result.sentTo}`,
        sentAt: result.sentAt,
        messageId: result.messageId
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la facture:', error);
      res.status(500).json({
        message: 'Erreur lors de l\'envoi de l\'email',
        error: error.message
      });
    }
  }
};

module.exports = invoiceController;
