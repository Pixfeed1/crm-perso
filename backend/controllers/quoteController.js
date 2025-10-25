// backend/controllers/quoteController.js
const quoteModel = require('../models/quoteModel');

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
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      items,
      cgv,
      tva_rate,
      tva_applicable,
      acompte_type,
      acompte_value,
      escompte_percent,
      escompte_days,
      validity_days,
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
        client_id,
        client_name,
        client_email,
        client_address,
        client_siret,
        items,
        cgv,
        tva_rate,
        tva_applicable,
        acompte_type,
        acompte_value,
        escompte_percent,
        escompte_days,
        validity_days,
        notes
      });

      res.status(201).json({
        message: 'Devis créé avec succès',
        id: result.id,
        quote_number: result.quote_number
      });
    } catch (error) {
      console.error('Erreur lors de la création du devis:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour un devis
   */
  updateQuote: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      status,
      items,
      cgv,
      tva_rate,
      tva_applicable,
      acompte_type,
      acompte_value,
      escompte_percent,
      escompte_days,
      validity_days,
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
        client_id,
        client_name,
        client_email,
        client_address,
        client_siret,
        status,
        items,
        cgv,
        tva_rate,
        tva_applicable,
        acompte_type,
        acompte_value,
        escompte_percent,
        escompte_days,
        validity_days,
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
  }
};

module.exports = quoteController;
