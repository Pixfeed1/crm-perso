// backend/controllers/paymentController.js
const paymentModel = require('../models/paymentModel');

/**
 * Contrôleur pour la gestion des paiements
 */
const paymentController = {
  /**
   * Récupérer tous les paiements
   */
  getAllPayments: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const payments = await paymentModel.getAllPayments(db);
      res.json(payments);
    } catch (error) {
      console.error('Erreur lors de la récupération des paiements:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer un paiement spécifique
   */
  getPaymentById: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const payment = await paymentModel.getPaymentById(db, id);

      if (!payment) {
        return res.status(404).json({ message: 'Paiement non trouvé' });
      }

      res.json(payment);
    } catch (error) {
      console.error('Erreur lors de la récupération du paiement:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les paiements d'une facture
   */
  getPaymentsByInvoice: async (req, res) => {
    const db = req.app.locals.db;
    const { invoiceId } = req.params;

    try {
      const payments = await paymentModel.getPaymentsByInvoice(db, invoiceId);
      res.json(payments);
    } catch (error) {
      console.error('Erreur lors de la récupération des paiements de la facture:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les paiements d'un client
   */
  getPaymentsByClient: async (req, res) => {
    const db = req.app.locals.db;
    const { clientId } = req.params;

    try {
      const payments = await paymentModel.getPaymentsByClient(db, clientId);
      res.json(payments);
    } catch (error) {
      console.error('Erreur lors de la récupération des paiements du client:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer un nouveau paiement
   */
  createPayment: async (req, res) => {
    const db = req.app.locals.db;
    const {
      invoice_id,
      amount,
      payment_date,
      payment_method,
      reference,
      status,
      notes
    } = req.body;

    // Validation
    if (!invoice_id || !amount) {
      return res.status(400).json({
        message: 'Les champs invoice_id et amount sont obligatoires'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        message: 'Le montant doit être supérieur à 0'
      });
    }

    try {
      const paymentData = {
        invoice_id,
        amount: parseFloat(amount),
        payment_date: payment_date || new Date(),
        payment_method,
        reference,
        status: status || 'completed',
        notes,
        created_by: req.user?.id || null
      };

      const payment = await paymentModel.createPayment(db, paymentData);

      res.status(201).json(payment);
    } catch (error) {
      console.error('Erreur lors de la création du paiement:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour un paiement
   */
  updatePayment: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      amount,
      payment_date,
      payment_method,
      reference,
      status,
      notes
    } = req.body;

    // Validation
    if (amount !== undefined && amount <= 0) {
      return res.status(400).json({
        message: 'Le montant doit être supérieur à 0'
      });
    }

    try {
      const paymentData = {
        amount: amount ? parseFloat(amount) : undefined,
        payment_date,
        payment_method,
        reference,
        status,
        notes
      };

      const payment = await paymentModel.updatePayment(db, id, paymentData);

      res.json(payment);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du paiement:', error);
      if (error.message === 'Paiement non trouvé') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Supprimer un paiement
   */
  deletePayment: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      await paymentModel.deletePayment(db, id);
      res.json({ message: 'Paiement supprimé avec succès' });
    } catch (error) {
      console.error('Erreur lors de la suppression du paiement:', error);
      if (error.message === 'Paiement non trouvé') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les statistiques de trésorerie
   */
  getTreasuryStats: async (req, res) => {
    const db = req.app.locals.db;
    const { startDate, endDate } = req.query;

    // Dates par défaut : mois en cours
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    try {
      const stats = await paymentModel.getTreasuryStats(db, start, end);
      res.json(stats);
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques de trésorerie:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les paiements pour le graphique de trésorerie
   */
  getPaymentsForChart: async (req, res) => {
    const db = req.app.locals.db;
    const { startDate, endDate } = req.query;

    // Dates par défaut : 30 derniers jours
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      const chartData = await paymentModel.getPaymentsForChart(db, start, end);
      res.json(chartData);
    } catch (error) {
      console.error('Erreur lors de la récupération des données pour le graphique:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = paymentController;
