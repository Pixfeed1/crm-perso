// backend/routes/calendarSyncRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const googleCalendarService = require('../services/googleCalendarService');
const outlookCalendarService = require('../services/outlookCalendarService');
const calendarSyncModel = require('../models/calendarSyncModel');
const eventModel = require('../models/eventModel');

// Appliquer le middleware d'authentification
router.use(authMiddleware);

// ============= GOOGLE CALENDAR =============

// Initier l'authentification Google
router.get('/google/auth', (req, res) => {
  try {
    const authUrl = googleCalendarService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Erreur lors de la génération de l\'URL Google:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Callback OAuth2 Google
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  const userId = req.user.id;

  if (!code) {
    return res.status(400).json({ message: 'Code d\'autorisation manquant' });
  }

  try {
    // Échanger le code contre des tokens
    const tokens = await googleCalendarService.getTokensFromCode(code);
    googleCalendarService.setCredentials(tokens);

    // Récupérer l'email de l'utilisateur
    const email = await googleCalendarService.getUserEmail();

    // Calculer l'expiration du token
    const tokenExpiry = new Date(Date.now() + (tokens.expiry_date || 3600 * 1000));

    // Sauvegarder la connexion
    const connection = await calendarSyncModel.upsertConnection(req.app.locals.db, {
      user_id: userId,
      provider: 'google',
      account_email: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokenExpiry
    });

    res.redirect(`${process.env.FRONTEND_URL}/calendar?sync=google&status=success`);
  } catch (error) {
    console.error('Erreur lors du callback Google:', error);
    res.redirect(`${process.env.FRONTEND_URL}/calendar?sync=google&status=error`);
  }
});

// ============= OUTLOOK CALENDAR =============

// Initier l'authentification Outlook
router.get('/outlook/auth', (req, res) => {
  try {
    const state = req.user.id.toString();
    const authUrl = outlookCalendarService.getAuthUrl(state);
    res.json({ authUrl });
  } catch (error) {
    console.error('Erreur lors de la génération de l\'URL Outlook:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Callback OAuth2 Outlook
router.get('/outlook/callback', async (req, res) => {
  const { code } = req.query;
  const userId = req.user.id;

  if (!code) {
    return res.status(400).json({ message: 'Code d\'autorisation manquant' });
  }

  try {
    // Échanger le code contre des tokens
    const tokens = await outlookCalendarService.getTokensFromCode(code);

    // Récupérer l'email de l'utilisateur
    const email = await outlookCalendarService.getUserEmail(tokens.access_token);

    // Calculer l'expiration du token
    const tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000));

    // Sauvegarder la connexion
    const connection = await calendarSyncModel.upsertConnection(req.app.locals.db, {
      user_id: userId,
      provider: 'outlook',
      account_email: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokenExpiry
    });

    res.redirect(`${process.env.FRONTEND_URL}/calendar?sync=outlook&status=success`);
  } catch (error) {
    console.error('Erreur lors du callback Outlook:', error);
    res.redirect(`${process.env.FRONTEND_URL}/calendar?sync=outlook&status=error`);
  }
});

// ============= GESTION DES CONNEXIONS =============

// Récupérer toutes les connexions de l'utilisateur
router.get('/connections', async (req, res) => {
  const userId = req.user.id;

  try {
    const connections = await calendarSyncModel.getUserConnections(req.app.locals.db, userId);
    res.json(connections);
  } catch (error) {
    console.error('Erreur lors de la récupération des connexions:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Déconnecter un calendrier
router.delete('/connections/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await calendarSyncModel.deactivateConnection(req.app.locals.db, id);
    res.json({ message: 'Connexion désactivée avec succès', connection });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ============= SYNCHRONISATION =============

// Synchroniser manuellement
router.post('/sync/:connectionId', async (req, res) => {
  const { connectionId } = req.params;
  const db = req.app.locals.db;

  try {
    const connection = await calendarSyncModel.getConnectionById(db, connectionId);

    if (!connection) {
      return res.status(404).json({ message: 'Connexion non trouvée' });
    }

    // Créer un log de synchronisation
    const syncLog = await calendarSyncModel.createSyncLog(db, {
      connection_id: connectionId,
      sync_type: 'manual',
      sync_direction: connection.sync_direction
    });

    // Effectuer la synchronisation
    const result = await performSync(db, connection, syncLog.id);

    res.json({
      message: 'Synchronisation effectuée avec succès',
      result
    });
  } catch (error) {
    console.error('Erreur lors de la synchronisation:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// Récupérer les logs de synchronisation
router.get('/logs/:connectionId', async (req, res) => {
  const { connectionId } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const logs = await calendarSyncModel.getSyncLogs(req.app.locals.db, connectionId, limit);
    res.json(logs);
  } catch (error) {
    console.error('Erreur lors de la récupération des logs:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer/Mettre à jour les préférences de synchronisation
router.get('/preferences/:connectionId', async (req, res) => {
  const { connectionId } = req.params;

  try {
    const preferences = await calendarSyncModel.getSyncPreferences(req.app.locals.db, connectionId);
    res.json(preferences ||{});
  } catch (error) {
    console.error('Erreur lors de la récupération des préférences:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/preferences/:connectionId', async (req, res) => {
  const { connectionId } = req.params;
  const preferencesData = { ...req.body, connection_id: connectionId };

  try {
    const preferences = await calendarSyncModel.upsertSyncPreferences(req.app.locals.db, preferencesData);
    res.json(preferences);
  } catch (error) {
    console.error('Erreur lors de la mise à jour des préférences:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ============= FONCTIONS UTILITAIRES =============

/**
 * Effectue la synchronisation bidirectionnelle
 */
async function performSync(db, connection, logId) {
  let stats = {
    events_imported: 0,
    events_exported: 0,
    events_updated: 0,
    events_deleted: 0,
    error_count: 0,
    errors: []
  };

  try {
    // Rafraîchir le token si nécessaire
    await refreshTokenIfNeeded(db, connection);

    // Récupérer les préférences
    const preferences = await calendarSyncModel.getSyncPreferences(db, connection.id) || {
      sync_past_days: 30,
      sync_future_days: 90
    };

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - preferences.sync_past_days);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + preferences.sync_future_days);

    // Import depuis le calendrier externe
    if (connection.sync_direction === 'import' || connection.sync_direction === 'bidirectional') {
      const importResult = await importFromExternal(db, connection, startDate, endDate);
      stats.events_imported = importResult.imported;
      stats.errors.push(...importResult.errors);
    }

    // Export vers le calendrier externe
    if (connection.sync_direction === 'export' || connection.sync_direction === 'bidirectional') {
      const exportResult = await exportToExternal(db, connection, startDate, endDate);
      stats.events_exported = exportResult.exported;
      stats.errors.push(...exportResult.errors);
    }

    // Mettre à jour le log
    await calendarSyncModel.updateSyncLog(db, logId, {
      status: stats.errors.length > 0 ? 'partial' : 'success',
      ...stats,
      error_details: stats.errors.length > 0 ? JSON.stringify(stats.errors) : null
    });

    // Mettre à jour la date de dernière synchro
    await calendarSyncModel.updateLastSync(db, connection.id);

    return stats;
  } catch (error) {
    console.error('Erreur lors de la synchronisation:', error);

    // Mettre à jour le log avec l'erreur
    await calendarSyncModel.updateSyncLog(db, logId, {
      status: 'error',
      ...stats,
      error_details: error.message
    });

    throw error;
  }
}

/**
 * Importe les événements depuis un calendrier externe
 */
async function importFromExternal(db, connection, startDate, endDate) {
  const result = { imported: 0, errors: [] };

  try {
    let externalEvents;

    if (connection.provider === 'google') {
      googleCalendarService.setCredentials({
        access_token: connection.access_token,
        refresh_token: connection.refresh_token
      });
      externalEvents = await googleCalendarService.importEvents(connection.id, startDate, endDate);
    } else if (connection.provider === 'outlook') {
      externalEvents = await outlookCalendarService.importEvents(connection.access_token, startDate, endDate);
    }

    // Importer chaque événement
    for (const externalEvent of externalEvents) {
      try {
        // Vérifier si l'événement existe déjà
        const existingMapping = await calendarSyncModel.getMappingByExternalEvent(
          db,
          externalEvent.external_event_id,
          connection.id
        );

        if (existingMapping) {
          // Mettre à jour l'événement existant
          await eventModel.updateEvent(db, existingMapping.internal_event_id, externalEvent);
        } else {
          // Créer un nouvel événement
          const newEvent = await eventModel.createEvent(db, externalEvent);

          // Créer le mapping
          await calendarSyncModel.createEventMapping(db, {
            connection_id: connection.id,
            internal_event_id: newEvent.id,
            external_event_id: externalEvent.external_event_id,
            external_calendar_id: externalEvent.external_calendar_id
          });
        }

        result.imported++;
      } catch (error) {
        console.error('Erreur lors de l\'import d\'un événement:', error);
        result.errors.push({
          event: externalEvent.title,
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'import:', error);
    result.errors.push({ error: error.message });
  }

  return result;
}

/**
 * Exporte les événements vers un calendrier externe
 */
async function exportToExternal(db, connection, startDate, endDate) {
  const result = { exported: 0, errors: [] };

  try {
    // Récupérer les événements locaux non synchronisés ou modifiés
    const events = await eventModel.getEventsInRange(db, startDate.toISOString(), endDate.toISOString());

    for (const event of events) {
      try {
        // Vérifier si l'événement est déjà synchronisé
        const existingMapping = await calendarSyncModel.getMappingByInternalEvent(db, event.id, connection.id);

        if (connection.provider === 'google') {
          googleCalendarService.setCredentials({
            access_token: connection.access_token,
            refresh_token: connection.refresh_token
          });

          if (existingMapping) {
            // Mettre à jour l'événement externe
            await googleCalendarService.updateEvent(existingMapping.external_event_id, event);
          } else {
            // Créer un nouvel événement externe
            const externalEvent = await googleCalendarService.exportEvent(event);

            // Créer le mapping
            await calendarSyncModel.createEventMapping(db, {
              connection_id: connection.id,
              internal_event_id: event.id,
              external_event_id: externalEvent.id,
              external_calendar_id: 'primary'
            });
          }
        } else if (connection.provider === 'outlook') {
          if (existingMapping) {
            // Mettre à jour l'événement externe
            await outlookCalendarService.updateEvent(connection.access_token, existingMapping.external_event_id, event);
          } else {
            // Créer un nouvel événement externe
            const externalEvent = await outlookCalendarService.exportEvent(connection.access_token, event);

            // Créer le mapping
            await calendarSyncModel.createEventMapping(db, {
              connection_id: connection.id,
              internal_event_id: event.id,
              external_event_id: externalEvent.id,
              external_calendar_id: externalEvent.calendar?.id || 'primary'
            });
          }
        }

        result.exported++;
      } catch (error) {
        console.error('Erreur lors de l\'export d\'un événement:', error);
        result.errors.push({
          event: event.title,
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    result.errors.push({ error: error.message });
  }

  return result;
}

/**
 * Rafraîchit le token si nécessaire
 */
async function refreshTokenIfNeeded(db, connection) {
  const tokenExpiry = new Date(connection.token_expiry);
  const now = new Date();

  // Si le token expire dans moins de 5 minutes, le rafraîchir
  if (tokenExpiry - now < 5 * 60 * 1000) {
    console.log('Rafraîchissement du token nécessaire');

    let newTokens;

    if (connection.provider === 'google') {
      newTokens = await googleCalendarService.refreshAccessToken(connection.refresh_token);
    } else if (connection.provider === 'outlook') {
      newTokens = await outlookCalendarService.refreshAccessToken(connection.refresh_token);
    }

    // Mettre à jour les tokens dans la base de données
    await calendarSyncModel.updateConnectionTokens(db, connection.id, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || connection.refresh_token,
      token_expiry: new Date(Date.now() + (newTokens.expires_in * 1000))
    });

    // Mettre à jour l'objet connection
    connection.access_token = newTokens.access_token;
    connection.refresh_token = newTokens.refresh_token || connection.refresh_token;
  }
}

module.exports = router;
