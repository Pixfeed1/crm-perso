// backend/controllers/clientController.js
const clientModel = require('../models/clientModel');

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
      const client = await clientModel.createClient(db, {
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
        contract_start_date,
        lifetime_value,
        notes,
        tags,
        status
      });

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

      const updatedClient = await clientModel.updateClient(db, id, {
        name,
        company,
        type,
        email,
        phone,
        address,
        website,
        industry,
        source,
        contract_start_date,
        lifetime_value,
        notes,
        tags,
        status
      });

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
  }
};

module.exports = clientController;
