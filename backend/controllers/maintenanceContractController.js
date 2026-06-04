// backend/controllers/maintenanceContractController.js
const maintenanceContractModel = require('../models/maintenanceContractModel');
const maintenanceBillingService = require('../services/maintenanceBillingService');

/**
 * Contrôleur pour la gestion des contrats de maintenance WordPress
 */
const maintenanceContractController = {
  /**
   * Récupérer tous les contrats de maintenance
   */
  getAllContracts: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const contracts = await maintenanceContractModel.getAllContracts(db);
      res.json(contracts);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la récupération des contrats:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les statistiques des contrats
   */
  getStats: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const stats = await maintenanceContractModel.getStats(db);
      res.json(stats);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la récupération des stats:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer un contrat spécifique avec ses interventions et rapports
   */
  getContractById: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const contract = await maintenanceContractModel.getContractById(db, id);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la récupération du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer un nouveau contrat de maintenance
   */
  createContract: async (req, res) => {
    const db = req.app.locals.db;
    const {
      client_id, site_name, site_url, contract_start_date, monthly_amount, plan, report_frequency,
      status, wordpress_version, php_version, hosting_provider, admin_url,
      pagespeed_mobile, pagespeed_desktop, plugins_count, notes
    } = req.body;

    if (!site_name) {
      return res.status(400).json({ message: 'Le nom du site est requis' });
    }

    try {
      const contract = await maintenanceContractModel.createContract(db, {
        client_id, site_name, site_url, contract_start_date, monthly_amount, plan, report_frequency,
        status, wordpress_version, php_version, hosting_provider, admin_url,
        pagespeed_mobile, pagespeed_desktop, plugins_count, notes
      });

      res.status(201).json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la création du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour un contrat de maintenance
   */
  updateContract: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const updateData = req.body;

    try {
      const contract = await maintenanceContractModel.updateContract(db, id, updateData);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la mise à jour du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour les scores PageSpeed d'un contrat
   */
  updatePageSpeed: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { mobile, desktop } = req.body;

    if (mobile === undefined || desktop === undefined) {
      return res.status(400).json({ message: 'Les scores mobile et desktop sont requis' });
    }

    try {
      const contract = await maintenanceContractModel.updatePageSpeed(db, id, mobile, desktop);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la mise à jour PageSpeed:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Supprimer un contrat de maintenance
   */
  deleteContract: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const contract = await maintenanceContractModel.deleteContract(db, id);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.status(204).send();
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la suppression du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Crée une Checkout Session Stripe (prélèvement SEPA mensuel) pour le contrat
   * et renvoie l'URL de paiement.
   */
  createBillingCheckout: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const { url } = await maintenanceBillingService.createCheckoutForContract(db, id);
      res.json({ url });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[MaintenanceContract] Erreur création checkout Stripe:', error);
      }
      res.status(status).json({ message: error.message || 'Erreur lors de la création du prélèvement' });
    }
  }
};

module.exports = maintenanceContractController;
