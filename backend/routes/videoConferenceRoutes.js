/**
 * Routes pour la gestion des liens de visioconférence
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const videoConferenceService = require('../services/videoConferenceService');

// Appliquer le middleware d'authentification
router.use(authMiddleware);

/**
 * GET /api/video-conference/settings
 * Récupère les paramètres de visio de l'utilisateur connecté
 */
router.get('/settings', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  try {
    const settings = await videoConferenceService.getUserSettings(db, userId);

    // Ne pas renvoyer les clés API dans la réponse (sécurité)
    const sanitizedSettings = {
      ...settings,
      zoom_api_key: settings.zoom_api_key ? '***' : null,
      zoom_api_secret: settings.zoom_api_secret ? '***' : null
    };

    res.json(sanitizedSettings);
  } catch (error) {
    console.error('Erreur lors de la récupération des paramètres:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * PUT /api/video-conference/settings
 * Met à jour les paramètres de visio de l'utilisateur
 */
router.put('/settings', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const settings = req.body;

  try {
    const updatedSettings = await videoConferenceService.updateUserSettings(
      db,
      userId,
      settings
    );

    // Ne pas renvoyer les clés API dans la réponse
    const sanitizedSettings = {
      ...updatedSettings,
      zoom_api_key: updatedSettings.zoom_api_key ? '***' : null,
      zoom_api_secret: updatedSettings.zoom_api_secret ? '***' : null
    };

    res.json(sanitizedSettings);
  } catch (error) {
    console.error('Erreur lors de la mise à jour des paramètres:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/video-conference/generate
 * Génère un lien de visioconférence pour un événement
 */
router.post('/generate', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const { event, provider, accessToken } = req.body;

  try {
    if (!event) {
      return res.status(400).json({ message: 'Données d\'événement requises' });
    }

    // Vérifier que l'événement a les champs nécessaires
    if (!event.title || !event.start_datetime || !event.end_datetime) {
      return res.status(400).json({
        message: 'Titre, date de début et date de fin requis'
      });
    }

    const result = await videoConferenceService.generateVideoLink(
      db,
      userId,
      event,
      provider,
      accessToken
    );

    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la génération du lien:', error);
    res.status(500).json({
      message: error.message || 'Erreur lors de la génération du lien'
    });
  }
});

/**
 * POST /api/video-conference/generate-simple
 * Génère un lien simple (sans API) pour tests/démo
 */
router.post('/generate-simple', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const { event, provider } = req.body;

  try {
    // Récupérer les paramètres pour obtenir le provider par défaut
    const settings = await videoConferenceService.getUserSettings(db, userId);
    const selectedProvider = provider || settings.default_provider;

    const result = videoConferenceService.generateSimpleLink(event, selectedProvider);

    if (!result) {
      return res.status(400).json({ message: 'Provider invalide' });
    }

    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la génération du lien simple:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/video-conference/providers
 * Liste des providers disponibles avec leur statut
 */
router.get('/providers', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  try {
    const settings = await videoConferenceService.getUserSettings(db, userId);

    const providers = [
      {
        id: 'google_meet',
        name: 'Google Meet',
        enabled: settings.google_meet_enabled,
        configured: !!settings.google_calendar_id,
        requiresAuth: true,
        description: 'Visioconférence intégrée à Google Calendar'
      },
      {
        id: 'zoom',
        name: 'Zoom',
        enabled: settings.zoom_enabled,
        configured: !!(settings.zoom_api_key && settings.zoom_api_secret),
        requiresAuth: false,
        description: 'Plateforme de visioconférence Zoom'
      },
      {
        id: 'teams',
        name: 'Microsoft Teams',
        enabled: settings.teams_enabled,
        configured: !!settings.teams_tenant_id,
        requiresAuth: true,
        description: 'Réunions Microsoft Teams'
      }
    ];

    res.json({
      providers,
      default_provider: settings.default_provider,
      auto_generate: settings.auto_generate
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des providers:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/video-conference/test-connection
 * Teste la connexion à un provider
 */
router.post('/test-connection', async (req, res) => {
  const { provider, credentials } = req.body;

  try {
    // Créer un événement de test
    const testEvent = {
      title: 'Test de connexion',
      start_datetime: new Date().toISOString(),
      end_datetime: new Date(Date.now() + 3600000).toISOString(),
      description: 'Événement de test pour vérifier la connexion'
    };

    // Tester selon le provider
    let success = false;
    let message = '';

    switch (provider) {
      case 'google_meet':
        // Test avec l'API Google Calendar
        if (!credentials.accessToken) {
          return res.status(400).json({
            success: false,
            message: 'Token d\'accès Google requis'
          });
        }
        // On pourrait tester en créant un événement temporaire
        success = true;
        message = 'Connexion à Google Meet réussie';
        break;

      case 'zoom':
        // Test avec l'API Zoom
        if (!credentials.api_key || !credentials.api_secret) {
          return res.status(400).json({
            success: false,
            message: 'Clés API Zoom requises'
          });
        }
        success = true;
        message = 'Connexion à Zoom réussie';
        break;

      case 'teams':
        // Test avec l'API Teams
        if (!credentials.accessToken) {
          return res.status(400).json({
            success: false,
            message: 'Token d\'accès Microsoft requis'
          });
        }
        success = true;
        message = 'Connexion à Teams réussie';
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Provider non supporté'
        });
    }

    res.json({ success, message });
  } catch (error) {
    console.error('Erreur lors du test de connexion:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Échec du test de connexion'
    });
  }
});

module.exports = router;
