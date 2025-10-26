// backend/controllers/tvaRegimeController.js
const tvaRegimeModel = require('../models/tvaRegimeModel');

const tvaRegimeController = {
  /**
   * GET /api/tva-regimes - Récupérer tous les régimes TVA
   */
  getAll: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const regimes = await tvaRegimeModel.getAllTvaRegimes(db);
      res.json(regimes);
    } catch (error) {
      console.error('Erreur lors de la récupération des régimes TVA:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/tva-regimes/:code - Récupérer un régime par code
   */
  getByCode: async (req, res) => {
    const db = req.app.locals.db;
    const { code } = req.params;

    try {
      const regime = await tvaRegimeModel.getTvaRegimeByCode(db, code);
      if (!regime) {
        return res.status(404).json({ message: 'Régime TVA non trouvé' });
      }
      res.json(regime);
    } catch (error) {
      console.error('Erreur lors de la récupération du régime TVA:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = tvaRegimeController;
