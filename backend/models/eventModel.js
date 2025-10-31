// backend/models/eventModel.js

/**
 * Récupère tous les événements avec filtres de date optionnels
 */
const getAllEvents = (db, filters = {}) => {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM events';
    const params = [];

    // Ajouter des filtres de date si spécifiés
    if (filters.start_date && filters.end_date) {
      query += ' WHERE start_datetime >= ? AND end_datetime <= ?';
      params.push(filters.start_date, filters.end_date);
    } else if (filters.start_date) {
      query += ' WHERE start_datetime >= ?';
      params.push(filters.start_date);
    } else if (filters.end_date) {
      query += ' WHERE end_datetime <= ?';
      params.push(filters.end_date);
    }

    query += ' ORDER BY start_datetime ASC';

    db.all(query, params, (err, events) => {
      if (err) {
        console.error('[EventModel] Erreur lors de la récupération des événements:', err);
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Récupère un événement par son ID
 */
const getEventById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM events WHERE id = ?', [id], (err, event) => {
      if (err) {
        console.error('[EventModel] Erreur lors de la récupération de l\'événement:', err);
        reject(err);
      } else {
        resolve(event);
      }
    });
  });
};

/**
 * Crée un nouvel événement
 */
const createEvent = (db, eventData) => {
  return new Promise((resolve, reject) => {
    const {
      title,
      description,
      start_datetime,
      end_datetime,
      all_day = false,
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
        location, category, priority, color, reminder_time, activity_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [
        title,
        description || null,
        start_datetime,
        end_datetime || start_datetime, // Si pas de date de fin, utiliser la date de début
        all_day ? 1 : 0,
        location || null,
        category || null,
        priority || null,
        color || null,
        reminder_time || null,
        activity_id || null,
        now
      ],
      function(err) {
        if (err) {
          console.error('[EventModel] Erreur lors de la création de l\'événement:', err);
          reject(err);
        } else {
          getEventById(db, this.lastID)
            .then(event => resolve(event))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met à jour un événement
 */
const updateEvent = (db, id, eventData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (eventData.title !== undefined) {
      fields.push('title = ?');
      values.push(eventData.title);
    }
    if (eventData.description !== undefined) {
      fields.push('description = ?');
      values.push(eventData.description);
    }
    if (eventData.start_datetime !== undefined) {
      fields.push('start_datetime = ?');
      values.push(eventData.start_datetime);
    }
    if (eventData.end_datetime !== undefined) {
      fields.push('end_datetime = ?');
      values.push(eventData.end_datetime);
    }
    if (eventData.all_day !== undefined) {
      fields.push('all_day = ?');
      values.push(eventData.all_day ? 1 : 0);
    }
    if (eventData.location !== undefined) {
      fields.push('location = ?');
      values.push(eventData.location);
    }
    if (eventData.category !== undefined) {
      fields.push('category = ?');
      values.push(eventData.category);
    }
    if (eventData.priority !== undefined) {
      fields.push('priority = ?');
      values.push(eventData.priority);
    }
    if (eventData.color !== undefined) {
      fields.push('color = ?');
      values.push(eventData.color);
    }
    if (eventData.reminder_time !== undefined) {
      fields.push('reminder_time = ?');
      values.push(eventData.reminder_time);
    }
    if (eventData.activity_id !== undefined) {
      fields.push('activity_id = ?');
      values.push(eventData.activity_id);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Ajouter l'ID pour la clause WHERE
    values.push(id);

    const query = `UPDATE events SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[EventModel] Erreur lors de la mise à jour de l\'événement:', err);
        reject(err);
      } else {
        getEventById(db, id)
          .then(event => resolve(event))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Supprime un événement
 */
const deleteEvent = (db, id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM events WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('[EventModel] Erreur lors de la suppression de l\'événement:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Récupère les événements d'une activité spécifique
 */
const getEventsByActivity = (db, activityId) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM events WHERE activity_id = ? ORDER BY start_datetime ASC';

    db.all(query, [activityId], (err, events) => {
      if (err) {
        console.error('[EventModel] Erreur lors de la récupération des événements de l\'activité:', err);
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Récupère les événements dans une plage de dates
 */
const getEventsInRange = (db, startDate, endDate) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM events
      WHERE start_datetime >= ? AND end_datetime <= ?
      ORDER BY start_datetime ASC
    `;

    db.all(query, [startDate, endDate], (err, events) => {
      if (err) {
        console.error('[EventModel] Erreur lors de la récupération des événements dans la plage:', err);
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Récupère les événements à venir
 */
const getUpcomingEvents = (db, limit = 10) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const query = `
      SELECT * FROM events
      WHERE start_datetime >= ?
      ORDER BY start_datetime ASC
      LIMIT ?
    `;

    db.all(query, [now, limit], (err, events) => {
      if (err) {
        console.error('[EventModel] Erreur lors de la récupération des événements à venir:', err);
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Crée un événement récurrent avec ses paramètres de récurrence
 */
const createRecurringEvent = (db, eventData) => {
  return new Promise((resolve, reject) => {
    const {
      title,
      description,
      start_datetime,
      end_datetime,
      all_day = false,
      location,
      category,
      priority,
      color,
      reminder_time,
      activity_id,
      recurrence_type,
      recurrence_interval,
      recurrence_days,
      recurrence_end_type,
      recurrence_end_date,
      recurrence_count
    } = eventData;

    if (!title || !start_datetime) {
      return reject(new Error('Titre et date de début sont requis'));
    }

    if (!recurrence_type || recurrence_type === 'NONE') {
      return reject(new Error('Type de récurrence requis pour un événement récurrent'));
    }

    const query = `
      INSERT INTO events (
        title, description, start_datetime, end_datetime, all_day,
        location, category, priority, color, reminder_time, activity_id,
        recurrence_type, recurrence_interval, recurrence_days,
        recurrence_end_type, recurrence_end_date, recurrence_count,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [
        title,
        description || null,
        start_datetime,
        end_datetime || start_datetime,
        all_day ? 1 : 0,
        location || null,
        category || null,
        priority || null,
        color || null,
        reminder_time || null,
        activity_id || null,
        recurrence_type,
        recurrence_interval || 1,
        recurrence_days || null,
        recurrence_end_type || 'NEVER',
        recurrence_end_date || null,
        recurrence_count || null,
        now
      ],
      function(err) {
        if (err) {
          console.error('[EventModel] Erreur lors de la création de l\'événement récurrent:', err);
          reject(err);
        } else {
          getEventById(db, this.lastID)
            .then(event => resolve(event))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Récupère les exceptions (occurrences supprimées) d'un événement récurrent
 */
const getEventExceptions = (db, eventId) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT exception_date FROM event_exceptions WHERE parent_event_id = ?';

    db.all(query, [eventId], (err, exceptions) => {
      if (err) {
        console.error('[EventModel] Erreur lors de la récupération des exceptions:', err);
        reject(err);
      } else {
        resolve((exceptions || []).map(e => e.exception_date));
      }
    });
  });
};

/**
 * Ajoute une exception (supprime une occurrence spécifique d'un événement récurrent)
 */
const addEventException = (db, eventId, exceptionDate) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO event_exceptions (parent_event_id, exception_date, created_at)
      VALUES (?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(query, [eventId, exceptionDate, now], function(err) {
      if (err) {
        console.error('[EventModel] Erreur lors de l\'ajout de l\'exception:', err);
        reject(err);
      } else {
        resolve({ success: true, id: this.lastID });
      }
    });
  });
};

/**
 * Supprime une exception (restaure une occurrence supprimée)
 */
const removeEventException = (db, eventId, exceptionDate) => {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM event_exceptions WHERE parent_event_id = ? AND exception_date = ?';

    db.run(query, [eventId, exceptionDate], function(err) {
      if (err) {
        console.error('[EventModel] Erreur lors de la suppression de l\'exception:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Crée une modification spécifique d'une occurrence (événement exception)
 */
const createEventException = (db, parentEventId, exceptionDate, modifiedData) => {
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
      reminder_time
    } = modifiedData;

    const query = `
      INSERT INTO events (
        title, description, start_datetime, end_datetime, all_day,
        location, category, priority, color, reminder_time,
        parent_event_id, is_exception, exception_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [
        title,
        description || null,
        start_datetime,
        end_datetime || start_datetime,
        all_day ? 1 : 0,
        location || null,
        category || null,
        priority || null,
        color || null,
        reminder_time || null,
        parentEventId,
        1, // is_exception = true
        exceptionDate,
        now
      ],
      function(err) {
        if (err) {
          console.error('[EventModel] Erreur lors de la création de l\'exception modifiée:', err);
          reject(err);
        } else {
          getEventById(db, this.lastID)
            .then(event => resolve(event))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Récupère toutes les occurrences modifiées (exceptions) d'un événement récurrent
 */
const getModifiedOccurrences = (db, eventId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM events
      WHERE parent_event_id = ? AND is_exception = 1
      ORDER BY exception_date ASC
    `;

    db.all(query, [eventId], (err, events) => {
      if (err) {
        console.error('[EventModel] Erreur lors de la récupération des occurrences modifiées:', err);
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByActivity,
  getEventsInRange,
  getUpcomingEvents,
  createRecurringEvent,
  getEventExceptions,
  addEventException,
  removeEventException,
  createEventException,
  getModifiedOccurrences
};
