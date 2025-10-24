// backend/models/eventModel.js

/**
 * Modèle pour la gestion des événements du calendrier
 */
const db = require('../config/pgConfig');

const eventModel = {
  /**
   * Récupérer tous les événements avec filtres optionnels
   * @param {Object} filters - Filtres (start_date, end_date)
   * @returns {Promise<Array>} Liste des événements
   */
  getAllEvents: (filters = {}) => {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM events';
      let params = [];

      // Ajouter des filtres de date si spécifiés
      if (filters.start_date && filters.end_date) {
        query += ' WHERE start_datetime >= ? AND end_datetime <= ?';
        params = [filters.start_date, filters.end_date];
      } else if (filters.start_date) {
        query += ' WHERE start_datetime >= ?';
        params = [filters.start_date];
      } else if (filters.end_date) {
        query += ' WHERE end_datetime <= ?';
        params = [filters.end_date];
      }

      query += ' ORDER BY start_datetime ASC';

      db.all(query, params, (err, events) => {
        if (err) {
          console.error('[EventModel] Erreur lors de la récupération des événements:', err);
          reject(new Error('Erreur serveur lors de la récupération des événements: ' + err.message));
        } else {
          resolve(events);
        }
      });
    });
  },

  /**
   * Récupérer un événement par son ID
   * @param {number} id - ID de l'événement
   * @returns {Promise<Object>} Événement
   */
  getEventById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM events WHERE id = ?', [id], (err, event) => {
        if (err) {
          console.error(`[EventModel] Erreur lors de la récupération de l'événement ${id}:`, err);
          reject(new Error('Erreur serveur lors de la récupération de l\'événement: ' + err.message));
        } else {
          resolve(event || null);
        }
      });
    });
  },

  /**
   * Créer un nouvel événement
   * @param {Object} eventData - Données de l'événement
   * @returns {Promise<Object>} Événement créé
   */
  createEvent: (eventData) => {
    return new Promise((resolve, reject) => {
      const {
        title,
        description,
        start_datetime,
        end_datetime,
        all_day,
        location,
        category,
        priority,
        color,
        reminder_time,
        activity_id
      } = eventData;

      if (!title || !start_datetime) {
        return reject(new Error('Titre et date de début sont requis'));
      }

      const query = `
        INSERT INTO events (
          title, description, start_datetime, end_datetime, all_day,
          location, category, priority, color, reminder_time, activity_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const now = new Date().toISOString();

      db.run(query, [
        title,
        description || null,
        start_datetime,
        end_datetime || start_datetime,
        all_day ? 1 : 0,
        location || null,
        category || null,
        priority || 'medium',
        color || null,
        reminder_time || null,
        activity_id || null,
        now,
        now
      ], function(err) {
        if (err) {
          console.error('[EventModel] Erreur lors de la création de l\'événement:', err);
          reject(new Error('Erreur serveur lors de la création de l\'événement: ' + err.message));
        } else {
          const newEventId = this.lastID;

          // Récupérer l'événement créé
          db.get('SELECT * FROM events WHERE id = ?', [newEventId], (err, event) => {
            if (err) {
              console.error('[EventModel] Erreur lors de la récupération de l\'événement créé:', err);
              resolve({ id: newEventId, ...eventData });
            } else {
              resolve(event);
            }
          });
        }
      });
    });
  },

  /**
   * Mettre à jour un événement
   * @param {number} id - ID de l'événement
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Événement mis à jour
   */
  updateEvent: (id, updateData) => {
    return new Promise((resolve, reject) => {
      // Vérifier si l'événement existe
      db.get('SELECT * FROM events WHERE id = ?', [id], (err, event) => {
        if (err) {
          console.error(`[EventModel] Erreur lors de la vérification de l'événement ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!event) {
          return reject(new Error('Événement non trouvé'));
        }

        // Construire la requête de mise à jour
        const updates = [];
        const params = [];

        if (updateData.title !== undefined) {
          updates.push('title = ?');
          params.push(updateData.title);
        }

        if (updateData.description !== undefined) {
          updates.push('description = ?');
          params.push(updateData.description);
        }

        if (updateData.start_datetime !== undefined) {
          updates.push('start_datetime = ?');
          params.push(updateData.start_datetime);
        }

        if (updateData.end_datetime !== undefined) {
          updates.push('end_datetime = ?');
          params.push(updateData.end_datetime);
        }

        if (updateData.all_day !== undefined) {
          updates.push('all_day = ?');
          params.push(updateData.all_day ? 1 : 0);
        }

        if (updateData.location !== undefined) {
          updates.push('location = ?');
          params.push(updateData.location);
        }

        if (updateData.category !== undefined) {
          updates.push('category = ?');
          params.push(updateData.category);
        }

        if (updateData.priority !== undefined) {
          updates.push('priority = ?');
          params.push(updateData.priority);
        }

        if (updateData.color !== undefined) {
          updates.push('color = ?');
          params.push(updateData.color);
        }

        if (updateData.reminder_time !== undefined) {
          updates.push('reminder_time = ?');
          params.push(updateData.reminder_time);
        }

        if (updateData.activity_id !== undefined) {
          updates.push('activity_id = ?');
          params.push(updateData.activity_id);
        }

        // Ajouter la date de mise à jour
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());

        // Ajouter l'ID pour la clause WHERE
        params.push(id);

        const query = `
          UPDATE events
          SET ${updates.join(', ')}
          WHERE id = ?
        `;

        db.run(query, params, function(err) {
          if (err) {
            console.error(`[EventModel] Erreur lors de la mise à jour de l'événement ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            // Récupérer l'événement mis à jour
            db.get('SELECT * FROM events WHERE id = ?', [id], (err, updatedEvent) => {
              if (err) {
                console.error('[EventModel] Erreur lors de la récupération de l\'événement mis à jour:', err);
                resolve({ id, ...event, ...updateData });
              } else {
                resolve(updatedEvent);
              }
            });
          }
        });
      });
    });
  },

  /**
   * Supprimer un événement
   * @param {number} id - ID de l'événement
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteEvent: (id) => {
    return new Promise((resolve, reject) => {
      // Vérifier si l'événement existe
      db.get('SELECT * FROM events WHERE id = ?', [id], (err, event) => {
        if (err) {
          console.error(`[EventModel] Erreur lors de la vérification de l'événement ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!event) {
          return reject(new Error('Événement non trouvé'));
        }

        // Supprimer l'événement
        db.run('DELETE FROM events WHERE id = ?', [id], function(err) {
          if (err) {
            console.error(`[EventModel] Erreur lors de la suppression de l'événement ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            resolve({ id, changes: this.changes });
          }
        });
      });
    });
  },

  /**
   * Récupérer les événements pour une période spécifique
   * @param {string} startDate - Date de début
   * @param {string} endDate - Date de fin
   * @returns {Promise<Array>} Liste des événements
   */
  getEventsByRange: (startDate, endDate) => {
    return new Promise((resolve, reject) => {
      if (!startDate || !endDate) {
        return reject(new Error('Les dates de début et de fin sont requises'));
      }

      const query = `
        SELECT * FROM events
        WHERE (start_datetime >= ? AND start_datetime <= ?)
           OR (end_datetime >= ? AND end_datetime <= ?)
           OR (start_datetime <= ? AND end_datetime >= ?)
        ORDER BY start_datetime ASC
      `;

      db.all(query, [startDate, endDate, startDate, endDate, startDate, endDate], (err, events) => {
        if (err) {
          console.error('[EventModel] Erreur lors de la récupération des événements par période:', err);
          reject(new Error('Erreur serveur lors de la récupération des événements: ' + err.message));
        } else {
          resolve(events);
        }
      });
    });
  },

  /**
   * Récupérer les événements à venir (prochains X jours)
   * @param {number} days - Nombre de jours
   * @returns {Promise<Array>} Liste des événements
   */
  getUpcomingEvents: (days = 7) => {
    return new Promise((resolve, reject) => {
      const now = new Date();
      const future = new Date();
      future.setDate(now.getDate() + days);

      const query = `
        SELECT * FROM events
        WHERE start_datetime >= ? AND start_datetime <= ?
        ORDER BY start_datetime ASC
      `;

      db.all(query, [now.toISOString(), future.toISOString()], (err, events) => {
        if (err) {
          console.error('[EventModel] Erreur lors de la récupération des événements à venir:', err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          resolve(events);
        }
      });
    });
  },

  /**
   * Récupérer les événements liés à une activité
   * @param {number} activityId - ID de l'activité
   * @returns {Promise<Array>} Liste des événements
   */
  getEventsByActivity: (activityId) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM events
        WHERE activity_id = ?
        ORDER BY start_datetime ASC
      `;

      db.all(query, [activityId], (err, events) => {
        if (err) {
          console.error(`[EventModel] Erreur lors de la récupération des événements pour l'activité ${activityId}:`, err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          resolve(events);
        }
      });
    });
  }
};

module.exports = eventModel;
