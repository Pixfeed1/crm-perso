// backend/controllers/leadInteractionController.js

const leadInteractionModel = require('../models/leadInteractionModel');

/**
 * Contrôleur pour la gestion des interactions avec les leads
 */
const leadInteractionController = {
  /**
   * Récupérer toutes les interactions d'un lead
   */
  getInteractionsByLeadId: async (req, res) => {
    const db = req.app.locals.db;
    const { leadId } = req.params;

    try {
      const interactions = await leadInteractionModel.getInteractionsByLeadId(db, leadId);
      res.json(interactions);
    } catch (error) {
      console.error('Erreur lors de la récupération des interactions:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des interactions' });
    }
  },

  /**
   * Récupérer une interaction spécifique
   */
  getInteractionById: async (req, res) => {
    const db = req.app.locals.db;
    const { interactionId } = req.params;

    try {
      const interaction = await leadInteractionModel.getInteractionById(db, interactionId);

      if (!interaction) {
        return res.status(404).json({ message: 'Interaction non trouvée' });
      }

      res.json(interaction);
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'interaction:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer une nouvelle interaction
   */
  createInteraction: async (req, res) => {
    const db = req.app.locals.db;
    const { leadId } = req.params;
    const { contact_id, type, date, description, notes } = req.body;

    // Validation
    if (!type || !date) {
      return res.status(400).json({ message: 'Le type et la date sont requis' });
    }

    // Validation du type
    const validTypes = ['call', 'email', 'meeting', 'note'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Type invalide. Valeurs acceptées: call, email, meeting, note' });
    }

    try {
      const interactionData = {
        lead_id: leadId,
        contact_id,
        type,
        date,
        description,
        notes
      };

      const newInteraction = await leadInteractionModel.createInteraction(db, interactionData);
      res.status(201).json(newInteraction);
    } catch (error) {
      console.error('Erreur lors de la création de l\'interaction:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la création de l\'interaction' });
    }
  },

  /**
   * Mettre à jour une interaction
   */
  updateInteraction: async (req, res) => {
    const db = req.app.locals.db;
    const { interactionId } = req.params;
    const { contact_id, type, date, description, notes } = req.body;

    // Validation
    if (!type || !date) {
      return res.status(400).json({ message: 'Le type et la date sont requis' });
    }

    // Validation du type
    const validTypes = ['call', 'email', 'meeting', 'note'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Type invalide. Valeurs acceptées: call, email, meeting, note' });
    }

    try {
      const interactionData = {
        contact_id,
        type,
        date,
        description,
        notes
      };

      const updatedInteraction = await leadInteractionModel.updateInteraction(db, interactionId, interactionData);

      if (!updatedInteraction) {
        return res.status(404).json({ message: 'Interaction non trouvée' });
      }

      res.json(updatedInteraction);
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'interaction:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la mise à jour de l\'interaction' });
    }
  },

  /**
   * Supprimer une interaction
   */
  deleteInteraction: async (req, res) => {
    const db = req.app.locals.db;
    const { interactionId } = req.params;

    try {
      const result = await leadInteractionModel.deleteInteraction(db, interactionId);

      if (!result.deleted) {
        return res.status(404).json({ message: 'Interaction non trouvée' });
      }

      res.json({ message: 'Interaction supprimée avec succès' });
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'interaction:', error);
      res.status(500).json({ message: 'Erreur serveur lors de la suppression de l\'interaction' });
    }
  }
};

module.exports = leadInteractionController;
