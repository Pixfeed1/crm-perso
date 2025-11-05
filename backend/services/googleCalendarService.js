/**
 * Service de synchronisation avec Google Calendar
 * Gère l'authentification OAuth2 et la synchronisation bidirectionnelle
 */

const { google } = require('googleapis');
const db = require('../config/pgConfig');

class GoogleCalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/calendar-sync/google/callback'
    );

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Génère l'URL d'authentification OAuth2 pour Google
   */
  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent' // Force le consentement pour obtenir un refresh token
    });
  }

  /**
   * Échange le code d'autorisation contre des tokens
   */
  async getTokensFromCode(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error('Erreur lors de l\'échange du code:', error);
      throw error;
    }
  }

  /**
   * Configure les credentials OAuth2
   */
  setCredentials(tokens) {
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * Rafraîchit le token d'accès
   */
  async refreshAccessToken(refreshToken) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du token:', error);
      throw error;
    }
  }

  /**
   * Récupère l'email de l'utilisateur connecté
   */
  async getUserEmail() {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();
      return data.email;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'email:', error);
      throw error;
    }
  }

  /**
   * Importe les événements depuis Google Calendar
   */
  async importEvents(connectionId, startDate, endDate) {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];
      console.log(`${events.length} événements trouvés dans Google Calendar`);

      return events.map(event => this.convertGoogleEventToInternal(event));
    } catch (error) {
      console.error('Erreur lors de l\'import depuis Google Calendar:', error);
      throw error;
    }
  }

  /**
   * Exporte un événement vers Google Calendar
   */
  async exportEvent(event, calendarId = 'primary') {
    try {
      const googleEvent = this.convertInternalEventToGoogle(event);

      const response = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: googleEvent
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'export vers Google Calendar:', error);
      throw error;
    }
  }

  /**
   * Met à jour un événement dans Google Calendar
   */
  async updateEvent(externalEventId, event, calendarId = 'primary') {
    try {
      const googleEvent = this.convertInternalEventToGoogle(event);

      const response = await this.calendar.events.update({
        calendarId: calendarId,
        eventId: externalEventId,
        resource: googleEvent
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour dans Google Calendar:', error);
      throw error;
    }
  }

  /**
   * Supprime un événement de Google Calendar
   */
  async deleteEvent(externalEventId, calendarId = 'primary') {
    try {
      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: externalEventId
      });

      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression dans Google Calendar:', error);
      throw error;
    }
  }

  /**
   * Convertit un événement Google en format interne
   */
  convertGoogleEventToInternal(googleEvent) {
    const start = googleEvent.start.dateTime || googleEvent.start.date;
    const end = googleEvent.end.dateTime || googleEvent.end.date;
    const allDay = !googleEvent.start.dateTime; // Si pas d'heure, c'est un événement sur toute la journée

    return {
      title: googleEvent.summary || 'Sans titre',
      description: googleEvent.description || '',
      start_datetime: start,
      end_datetime: end,
      all_day: allDay,
      location: googleEvent.location || '',
      category: 'meeting',
      priority: 'medium',
      color: this.mapGoogleColorToInternal(googleEvent.colorId),
      is_synced: true,
      sync_source: 'google',
      external_event_id: googleEvent.id,
      external_calendar_id: googleEvent.organizer?.email || 'primary'
    };
  }

  /**
   * Convertit un événement interne en format Google
   */
  convertInternalEventToGoogle(event) {
    const googleEvent = {
      summary: event.title,
      description: event.description || '',
      location: event.location || ''
    };

    // Gérer les dates
    if (event.all_day) {
      // Événement sur toute la journée
      googleEvent.start = {
        date: new Date(event.start_datetime).toISOString().split('T')[0]
      };
      googleEvent.end = {
        date: new Date(event.end_datetime).toISOString().split('T')[0]
      };
    } else {
      // Événement avec heure
      googleEvent.start = {
        dateTime: new Date(event.start_datetime).toISOString(),
        timeZone: 'Europe/Paris'
      };
      googleEvent.end = {
        dateTime: new Date(event.end_datetime).toISOString(),
        timeZone: 'Europe/Paris'
      };
    }

    // Ajouter la couleur si disponible
    if (event.color) {
      googleEvent.colorId = this.mapInternalColorToGoogle(event.color);
    }

    // Gérer les événements récurrents
    if (event.recurrence_type && event.recurrence_type !== 'NONE') {
      googleEvent.recurrence = [this.convertRecurrenceToRRule(event)];
    }

    return googleEvent;
  }

  /**
   * Convertit une récurrence interne en RRULE Google
   */
  convertRecurrenceToRRule(event) {
    let rrule = `RRULE:FREQ=${event.recurrence_type}`;

    if (event.recurrence_interval && event.recurrence_interval > 1) {
      rrule += `;INTERVAL=${event.recurrence_interval}`;
    }

    if (event.recurrence_type === 'WEEKLY' && event.recurrence_days) {
      const dayMap = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
      const days = event.recurrence_days.split(',').map(d => dayMap[parseInt(d)]).join(',');
      rrule += `;BYDAY=${days}`;
    }

    if (event.recurrence_end_type === 'COUNT' && event.recurrence_count) {
      rrule += `;COUNT=${event.recurrence_count}`;
    } else if (event.recurrence_end_type === 'DATE' && event.recurrence_end_date) {
      const endDate = new Date(event.recurrence_end_date);
      const formatted = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      rrule += `;UNTIL=${formatted}`;
    }

    return rrule;
  }

  /**
   * Mappe les couleurs Google vers les couleurs internes
   */
  mapGoogleColorToInternal(googleColorId) {
    const colorMap = {
      '1': '#3B82F6', // Bleu
      '2': '#10B981', // Vert
      '4': '#F59E0B', // Orange
      '11': '#EF4444', // Rouge
      '3': '#8B5CF6', // Violet
      '5': '#EC4899'  // Rose
    };

    return colorMap[googleColorId] || '#3B82F6';
  }

  /**
   * Mappe les couleurs internes vers les couleurs Google
   */
  mapInternalColorToGoogle(hexColor) {
    const colorMap = {
      '#3B82F6': '1', // Bleu
      '#10B981': '2', // Vert
      '#F59E0B': '4', // Orange
      '#EF4444': '11', // Rouge
      '#8B5CF6': '3', // Violet
      '#EC4899': '5'  // Rose
    };

    return colorMap[hexColor] || '1';
  }

  /**
   * Surveille les changements dans Google Calendar (webhooks)
   */
  async setupWatch(calendarId = 'primary', channelId, webhookUrl) {
    try {
      const response = await this.calendar.events.watch({
        calendarId: calendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          expiration: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 jours
        }
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la configuration du watch:', error);
      throw error;
    }
  }

  /**
   * Arrête la surveillance des changements
   */
  async stopWatch(channelId, resourceId) {
    try {
      await this.calendar.channels.stop({
        requestBody: {
          id: channelId,
          resourceId: resourceId
        }
      });

      return true;
    } catch (error) {
      console.error('Erreur lors de l\'arrêt du watch:', error);
      throw error;
    }
  }
}

module.exports = new GoogleCalendarService();
