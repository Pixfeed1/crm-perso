// backend/controllers/paymentMethodController.js
const paymentMethodModel = require('../models/paymentMethodModel');

const paymentMethodController = {
  /**
   * GET /api/payment-methods - Récupérer tous les moyens de paiement
   */
  getAll: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const methods = await paymentMethodModel.getAllPaymentMethods(db);
      res.json(methods);
    } catch (error) {
      console.error('Erreur lors de la récupération des moyens de paiement:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/payment-methods/:code - Récupérer un moyen par code
   */
  getByCode: async (req, res) => {
    const db = req.app.locals.db;
    const { code } = req.params;

    try {
      const method = await paymentMethodModel.getPaymentMethodByCode(db, code);
      if (!method) {
        return res.status(404).json({ message: 'Moyen de paiement non trouvé' });
      }
      res.json(method);
    } catch (error) {
      console.error('Erreur lors de la récupération du moyen de paiement:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = paymentMethodController;
