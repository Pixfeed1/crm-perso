/**
 * Service de génération de liens de visioconférence
 * Supporte : Google Meet, Zoom, Microsoft Teams
 */

const axios = require('axios');
const crypto = require('crypto');

/**
 * Récupère les paramètres de visio d'un utilisateur
 */
async function getUserSettings(db, userId) {
  try {
    const result = await db.query(
      'SELECT * FROM video_conference_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Créer des paramètres par défaut
      const defaultSettings = {
        user_id: userId,
        default_provider: 'google_meet',
        auto_generate: false,
        google_meet_enabled: false,
        zoom_enabled: false,
        teams_enabled: false,
        default_duration: 60,
        default_join_before_host: true,
        default_waiting_room: false,
        default_recording: false
      };

      const insertResult = await db.query(`
        INSERT INTO video_conference_settings (
          user_id, default_provider, auto_generate, google_meet_enabled,
          zoom_enabled, teams_enabled, default_duration, default_join_before_host,
          default_waiting_room, default_recording
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        defaultSettings.user_id,
        defaultSettings.default_provider,
        defaultSettings.auto_generate,
        defaultSettings.google_meet_enabled,
        defaultSettings.zoom_enabled,
        defaultSettings.teams_enabled,
        defaultSettings.default_duration,
        defaultSettings.default_join_before_host,
        defaultSettings.default_waiting_room,
        defaultSettings.default_recording
      ]);

      return insertResult.rows[0];
    }

    return result.rows[0];
  } catch (error) {
    console.error('Erreur lors de la récupération des paramètres:', error);
    throw error;
  }
}

/**
 * Met à jour les paramètres de visio d'un utilisateur
 */
async function updateUserSettings(db, userId, settings) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    // Construire dynamiquement la requête UPDATE
    for (const [key, value] of Object.entries(settings)) {
      if (key !== 'user_id' && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    values.push(userId);

    const query = `
      UPDATE video_conference_settings
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Paramètres introuvables');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Erreur lors de la mise à jour des paramètres:', error);
    throw error;
  }
}

/**
 * Génère un lien Google Meet via Calendar API
 */
async function generateGoogleMeetLink(event, settings, accessToken) {
  try {
    // Google Meet nécessite de créer un événement dans Calendar
    // On utilise le service Google Calendar existant

    const calendarEvent = {
      summary: event.title,
      description: event.description || '',
      start: {
        dateTime: event.start_datetime,
        timeZone: 'Europe/Paris'
      },
      end: {
        dateTime: event.end_datetime,
        timeZone: 'Europe/Paris'
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    };

    if (event.location) {
      calendarEvent.location = event.location;
    }

    const response = await axios.post(
      `https://www.googleapis.com/calendar/v3/calendars/${settings.google_calendar_id || 'primary'}/events?conferenceDataVersion=1`,
      calendarEvent,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const meetLink = response.data.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri;

    return {
      video_link: meetLink,
      video_provider: 'google_meet',
      video_meeting_id: response.data.conferenceData?.conferenceId,
      external_event_id: response.data.id
    };
  } catch (error) {
    console.error('Erreur lors de la génération du lien Google Meet:', error);
    throw new Error('Impossible de générer le lien Google Meet');
  }
}

/**
 * Génère un lien Zoom via Zoom API
 */
async function generateZoomLink(event, settings) {
  try {
    // Générer un JWT pour l'authentification Zoom (ou utiliser OAuth)
    const zoomToken = generateZoomJWT(settings.zoom_api_key, settings.zoom_api_secret);

    const meetingData = {
      topic: event.title,
      type: 2, // Scheduled meeting
      start_time: new Date(event.start_datetime).toISOString(),
      duration: settings.default_duration || 60,
      timezone: 'Europe/Paris',
      agenda: event.description || '',
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: settings.default_join_before_host !== false,
        waiting_room: settings.default_waiting_room || false,
        auto_recording: settings.default_recording ? 'cloud' : 'none',
        mute_upon_entry: false
      }
    };

    const response = await axios.post(
      `https://api.zoom.us/v2/users/${settings.zoom_user_id || 'me'}/meetings`,
      meetingData,
      {
        headers: {
          'Authorization': `Bearer ${zoomToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      video_link: response.data.join_url,
      video_provider: 'zoom',
      video_meeting_id: response.data.id.toString(),
      host_link: response.data.start_url
    };
  } catch (error) {
    console.error('Erreur lors de la génération du lien Zoom:', error);
    throw new Error('Impossible de générer le lien Zoom');
  }
}

/**
 * Génère un JWT pour Zoom API
 */
function generateZoomJWT(apiKey, apiSecret) {
  // Simplified JWT generation - in production, use a library like jsonwebtoken
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: apiKey,
    exp: now + 3600 // 1 hour
  })).toString('base64');

  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64');

  return `${header}.${payload}.${signature}`;
}

/**
 * Génère un lien Microsoft Teams via Graph API
 */
async function generateTeamsLink(event, settings, accessToken) {
  try {
    // Créer une réunion en ligne Teams
    const meetingData = {
      subject: event.title,
      startDateTime: event.start_datetime,
      endDateTime: event.end_datetime,
      participants: {
        organizer: {
          identity: {
            user: {
              id: settings.teams_user_id
            }
          }
        }
      }
    };

    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/onlineMeetings',
      meetingData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      video_link: response.data.joinUrl,
      video_provider: 'teams',
      video_meeting_id: response.data.id
    };
  } catch (error) {
    console.error('Erreur lors de la génération du lien Teams:', error);
    throw new Error('Impossible de générer le lien Microsoft Teams');
  }
}

/**
 * Génère un lien de visio selon le provider
 */
async function generateVideoLink(db, userId, event, provider = null, accessToken = null) {
  try {
    // Récupérer les paramètres utilisateur
    const settings = await getUserSettings(db, userId);

    // Utiliser le provider par défaut si non spécifié
    const selectedProvider = provider || settings.default_provider;

    let result;

    switch (selectedProvider) {
      case 'google_meet':
        if (!settings.google_meet_enabled) {
          throw new Error('Google Meet non activé dans les paramètres');
        }
        if (!accessToken) {
          throw new Error('Token d\'accès Google requis');
        }
        result = await generateGoogleMeetLink(event, settings, accessToken);
        break;

      case 'zoom':
        if (!settings.zoom_enabled) {
          throw new Error('Zoom non activé dans les paramètres');
        }
        result = await generateZoomLink(event, settings);
        break;

      case 'teams':
        if (!settings.teams_enabled) {
          throw new Error('Microsoft Teams non activé dans les paramètres');
        }
        if (!accessToken) {
          throw new Error('Token d\'accès Microsoft requis');
        }
        result = await generateTeamsLink(event, settings, accessToken);
        break;

      default:
        throw new Error(`Provider non supporté: ${selectedProvider}`);
    }

    return result;
  } catch (error) {
    console.error('Erreur lors de la génération du lien vidéo:', error);
    throw error;
  }
}

/**
 * Génère un lien simple sans API (pour démo/développement)
 *
 * ⚠️ ATTENTION : Cette fonction génère des liens de démonstration NON FONCTIONNELS
 * Elle est utilisée pour les tests et le développement uniquement.
 *
 * Les liens générés :
 * - NE créent PAS de vraies réunions dans Google Meet, Zoom ou Teams
 * - Utilisent des IDs aléatoires qui ne correspondent à aucune réunion réelle
 * - Sont destinés UNIQUEMENT à tester l'interface utilisateur
 *
 * Pour des liens fonctionnels, utilisez generateVideoLink() avec les credentials API appropriés.
 *
 * @param {Object} event - L'événement pour lequel générer un lien
 * @param {string} provider - Le provider (google_meet, zoom, teams)
 * @returns {Object} Objet avec video_link, video_provider, video_meeting_id
 */
function generateSimpleLink(event, provider) {
  const meetingId = crypto.randomBytes(10).toString('hex');

  switch (provider) {
    case 'google_meet':
      return {
        video_link: `https://meet.google.com/${meetingId}`,
        video_provider: 'google_meet',
        video_meeting_id: meetingId
      };

    case 'zoom':
      return {
        video_link: `https://zoom.us/j/${meetingId}`,
        video_provider: 'zoom',
        video_meeting_id: meetingId
      };

    case 'teams':
      return {
        video_link: `https://teams.microsoft.com/l/meetup-join/${meetingId}`,
        video_provider: 'teams',
        video_meeting_id: meetingId
      };

    default:
      return null;
  }
}

/**
 * Vérifie si l'auto-génération est activée
 */
async function shouldAutoGenerate(db, userId) {
  try {
    const settings = await getUserSettings(db, userId);
    return settings.auto_generate;
  } catch (error) {
    return false;
  }
}

module.exports = {
  getUserSettings,
  updateUserSettings,
  generateVideoLink,
  generateSimpleLink,
  shouldAutoGenerate
};
