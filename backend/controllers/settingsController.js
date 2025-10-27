// backend/controllers/settingsController.js
const SettingsModel = require('../models/settingsModel');
const emailService = require('../services/emailService');

/**
 * Contrôleur pour les paramètres de l'entreprise
 */
const settingsController = {
  /**
   * GET /api/settings
   * Récupère les paramètres de l'entreprise
   */
  getSettings: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const settingsModel = new SettingsModel(db);
      const settings = await settingsModel.getSettings();
      res.status(200).json(settings);
    } catch (error) {
      console.error('[SettingsController] Erreur lors de la récupération:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des paramètres',
        details: error.message
      });
    }
  },

  /**
   * PUT /api/settings
   * Met à jour les paramètres de l'entreprise
   */
  updateSettings: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const settingsData = req.body;
      const settingsModel = new SettingsModel(db);
      const updatedSettings = await settingsModel.updateSettings(settingsData);
      res.status(200).json(updatedSettings);
    } catch (error) {
      console.error('[SettingsController] Erreur lors de la mise à jour:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour des paramètres',
        details: error.message
      });
    }
  },

  /**
   * POST /api/settings/logo
   * Met à jour le logo de l'entreprise
   */
  updateLogo: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const { logo_url } = req.body;

      if (!logo_url) {
        return res.status(400).json({ error: 'URL du logo requise' });
      }

      const settingsModel = new SettingsModel(db);
      const updatedSettings = await settingsModel.updateLogo(logo_url);
      res.status(200).json(updatedSettings);
    } catch (error) {
      console.error('[SettingsController] Erreur lors de la mise à jour du logo:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour du logo',
        details: error.message
      });
    }
  },

  /**
   * POST /api/settings/test-email
   * Teste la configuration email
   */
  testEmailConfig: async (req, res) => {
    try {
      const result = await emailService.testConnection();
      res.status(200).json(result);
    } catch (error) {
      console.error('[SettingsController] Erreur lors du test email:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors du test de la configuration email',
        details: error.message
      });
    }
  }
};

module.exports = settingsController;
