/**
 * Service de synchronisation avec Outlook Calendar (Microsoft Graph API)
 * Gère l'authentification OAuth2 et la synchronisation bidirectionnelle
 */

const axios = require('axios');

class OutlookCalendarService {
  constructor() {
    this.clientId = process.env.MICROSOFT_CLIENT_ID;
    this.clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    this.redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/api/calendar-sync/outlook/callback';
    this.authority = 'https://login.microsoftonline.com/common';
    this.graphApiEndpoint = 'https://graph.microsoft.com/v1.0';
  }

  /**
   * Génère l'URL d'authentification OAuth2 pour Microsoft
   */
  getAuthUrl(state) {
    const scopes = [
      'offline_access',
      'User.Read',
      'Calendars.ReadWrite'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: scopes,
      state: state || ''
    });

    return `${this.authority}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Échange le code d'autorisation contre des tokens
   */
  async getTokensFromCode(code) {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code'
      });

      const response = await axios.post(
        `${this.authority}/oauth2/v2.0/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in
      };
    } catch (error) {
      console.error('Erreur lors de l\'échange du code Outlook:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Rafraîchit le token d'accès
   */
  async refreshAccessToken(refreshToken) {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await axios.post(
        `${this.authority}/oauth2/v2.0/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        expires_in: response.data.expires_in
      };
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du token Outlook:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Récupère l'email de l'utilisateur connecté
   */
  async getUserEmail(accessToken) {
    try {
      const response = await axios.get(`${this.graphApiEndpoint}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      return response.data.mail || response.data.userPrincipalName;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'email Outlook:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Importe les événements depuis Outlook Calendar
   */
  async importEvents(accessToken, startDate, endDate) {
    try {
      const params = new URLSearchParams({
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
        $orderby: 'start/dateTime'
      });

      const response = await axios.get(
        `${this.graphApiEndpoint}/me/calendarview?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'outlook.timezone="Europe/Paris"'
          }
        }
      );

      const events = response.data.value || [];
      console.log(`${events.length} événements trouvés dans Outlook Calendar`);

      return events.map(event => this.convertOutlookEventToInternal(event));
    } catch (error) {
      console.error('Erreur lors de l\'import depuis Outlook Calendar:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Exporte un événement vers Outlook Calendar
   */
  async exportEvent(accessToken, event) {
    try {
      const outlookEvent = this.convertInternalEventToOutlook(event);

      const response = await axios.post(
        `${this.graphApiEndpoint}/me/events`,
        outlookEvent,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Erreur lors de l\'export vers Outlook Calendar:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Met à jour un événement dans Outlook Calendar
   */
  async updateEvent(accessToken, externalEventId, event) {
    try {
      const outlookEvent = this.convertInternalEventToOutlook(event);

      const response = await axios.patch(
        `${this.graphApiEndpoint}/me/events/${externalEventId}`,
        outlookEvent,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la mise à jour dans Outlook Calendar:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Supprime un événement d'Outlook Calendar
   */
  async deleteEvent(accessToken, externalEventId) {
    try {
      await axios.delete(
        `${this.graphApiEndpoint}/me/events/${externalEventId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression dans Outlook Calendar:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Convertit un événement Outlook en format interne
   */
  convertOutlookEventToInternal(outlookEvent) {
    const allDay = outlookEvent.isAllDay;

    return {
      title: outlookEvent.subject || 'Sans titre',
      description: outlookEvent.bodyPreview || outlookEvent.body?.content || '',
      start_datetime: outlookEvent.start.dateTime,
      end_datetime: outlookEvent.end.dateTime,
      all_day: allDay,
      location: outlookEvent.location?.displayName || '',
      category: 'meeting',
      priority: this.mapOutlookImportanceToPriority(outlookEvent.importance),
      color: this.mapOutlookCategoryToColor(outlookEvent.categories),
      is_synced: true,
      sync_source: 'outlook',
      external_event_id: outlookEvent.id,
      external_calendar_id: outlookEvent.calendar?.id || 'primary'
    };
  }

  /**
   * Convertit un événement interne en format Outlook
   */
  convertInternalEventToOutlook(event) {
    const outlookEvent = {
      subject: event.title,
      body: {
        contentType: 'Text',
        content: event.description || ''
      },
      start: {
        dateTime: new Date(event.start_datetime).toISOString(),
        timeZone: 'Europe/Paris'
      },
      end: {
        dateTime: new Date(event.end_datetime).toISOString(),
        timeZone: 'Europe/Paris'
      },
      isAllDay: event.all_day || false,
      importance: this.mapPriorityToOutlookImportance(event.priority)
    };

    // Ajouter le lieu si disponible
    if (event.location) {
      outlookEvent.location = {
        displayName: event.location
      };
    }

    // Ajouter les catégories si disponibles
    if (event.category) {
      outlookEvent.categories = [event.category];
    }

    // Gérer les événements récurrents
    if (event.recurrence_type && event.recurrence_type !== 'NONE') {
      outlookEvent.recurrence = this.convertRecurrenceToOutlook(event);
    }

    return outlookEvent;
  }

  /**
   * Convertit une récurrence interne en format Outlook
   */
  convertRecurrenceToOutlook(event) {
    const pattern = {
      type: event.recurrence_type.toLowerCase(),
      interval: event.recurrence_interval || 1
    };

    // Jours de la semaine pour récurrence hebdomadaire
    if (event.recurrence_type === 'WEEKLY' && event.recurrence_days) {
      const dayMap = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
      pattern.daysOfWeek = event.recurrence_days.split(',').map(d => dayMap[parseInt(d)]);
    }

    const range = {
      type: 'noEnd',
      startDate: new Date(event.start_datetime).toISOString().split('T')[0]
    };

    if (event.recurrence_end_type === 'COUNT' && event.recurrence_count) {
      range.type = 'numbered';
      range.numberOfOccurrences = event.recurrence_count;
    } else if (event.recurrence_end_type === 'DATE' && event.recurrence_end_date) {
      range.type = 'endDate';
      range.endDate = new Date(event.recurrence_end_date).toISOString().split('T')[0];
    }

    return { pattern, range };
  }

  /**
   * Mappe l'importance Outlook vers la priorité interne
   */
  mapOutlookImportanceToPriority(importance) {
    const importanceMap = {
      'high': 'high',
      'normal': 'medium',
      'low': 'low'
    };

    return importanceMap[importance] || 'medium';
  }

  /**
   * Mappe la priorité interne vers l'importance Outlook
   */
  mapPriorityToOutlookImportance(priority) {
    const priorityMap = {
      'high': 'high',
      'medium': 'normal',
      'low': 'low'
    };

    return priorityMap[priority] || 'normal';
  }

  /**
   * Mappe les catégories Outlook vers une couleur
   */
  mapOutlookCategoryToColor(categories) {
    if (!categories || categories.length === 0) {
      return '#3B82F6';
    }

    const colorMap = {
      'Blue category': '#3B82F6',
      'Green category': '#10B981',
      'Orange category': '#F59E0B',
      'Red category': '#EF4444',
      'Purple category': '#8B5CF6',
      'Pink category': '#EC4899'
    };

    return colorMap[categories[0]] || '#3B82F6';
  }

  /**
   * Configure un abonnement pour les notifications de changement
   */
  async setupSubscription(accessToken, notificationUrl) {
    try {
      const subscription = {
        changeType: 'created,updated,deleted',
        notificationUrl: notificationUrl,
        resource: 'me/events',
        expirationDateTime: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString(), // 3 jours
        clientState: 'secretClientState'
      };

      const response = await axios.post(
        `${this.graphApiEndpoint}/subscriptions`,
        subscription,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la création de l\'abonnement Outlook:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Supprime un abonnement
   */
  async deleteSubscription(accessToken, subscriptionId) {
    try {
      await axios.delete(
        `${this.graphApiEndpoint}/subscriptions/${subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'abonnement Outlook:', error.response?.data || error);
      throw error;
    }
  }
}

module.exports = new OutlookCalendarService();
