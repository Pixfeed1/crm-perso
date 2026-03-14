// backend/models/eventModel.js
// Converti en PostgreSQL natif ($1, $2, etc.)

const EVENT_COLUMNS = 'id, title, description, start_datetime, end_datetime, all_day, location, category, priority, color, reminder_time, activity_id, recurrence_type, recurrence_interval, recurrence_days, recurrence_end_type, recurrence_end_date, recurrence_count, parent_event_id, is_exception, exception_date, created_at';

/**
 * Recupere tous les evenements avec filtres de date optionnels
 */
const getAllEvents = (db, filters = {}) => {
  return new Promise((resolve, reject) => {
    let query = `SELECT ${EVENT_COLUMNS} FROM events`;
    const params = [];
    let paramIndex = 1;

    if (filters.start_date && filters.end_date) {
      query += ` WHERE start_datetime >= $${paramIndex++} AND end_datetime <= $${paramIndex++}`;
      params.push(filters.start_date, filters.end_date);
    } else if (filters.start_date) {
      query += ` WHERE start_datetime >= $${paramIndex++}`;
      params.push(filters.start_date);
    } else if (filters.end_date) {
      query += ` WHERE end_datetime <= $${paramIndex++}`;
      params.push(filters.end_date);
    }

    query += ' ORDER BY start_datetime ASC';

    db.all(query, params, (err, events) => {
      if (err) {
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Recupere un evenement par son ID
 */
const getEventById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`, [id], (err, event) => {
      if (err) {
        reject(err);
      } else {
        resolve(event);
      }
    });
  });
};

/**
 * Cree un nouvel evenement
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
      return reject(new Error('Titre et date de debut sont requis'));
    }

    const query = `
      INSERT INTO events (
        title, description, start_datetime, end_datetime, all_day,
        location, category, priority, color, reminder_time, activity_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.get(
      query,
      [
        title,
        description || null,
        start_datetime,
        end_datetime || start_datetime,
        all_day ? true : false,
        location || null,
        category || null,
        priority || null,
        color || null,
        reminder_time || null,
        activity_id || null,
        now
      ],
      function(err, result) {
        if (err) {
          reject(err);
        } else {
          const newId = result?.id || this.lastID;
          getEventById(db, newId)
            .then(event => resolve(event))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met a jour un evenement (requete dynamique)
 */
const updateEvent = (db, id, eventData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (eventData.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(eventData.title);
    }
    if (eventData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(eventData.description);
    }
    if (eventData.start_datetime !== undefined) {
      fields.push(`start_datetime = $${paramIndex++}`);
      values.push(eventData.start_datetime);
    }
    if (eventData.end_datetime !== undefined) {
      fields.push(`end_datetime = $${paramIndex++}`);
      values.push(eventData.end_datetime);
    }
    if (eventData.all_day !== undefined) {
      fields.push(`all_day = $${paramIndex++}`);
      values.push(eventData.all_day ? true : false);
    }
    if (eventData.location !== undefined) {
      fields.push(`location = $${paramIndex++}`);
      values.push(eventData.location);
    }
    if (eventData.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(eventData.category);
    }
    if (eventData.priority !== undefined) {
      fields.push(`priority = $${paramIndex++}`);
      values.push(eventData.priority);
    }
    if (eventData.color !== undefined) {
      fields.push(`color = $${paramIndex++}`);
      values.push(eventData.color);
    }
    if (eventData.reminder_time !== undefined) {
      fields.push(`reminder_time = $${paramIndex++}`);
      values.push(eventData.reminder_time);
    }
    if (eventData.activity_id !== undefined) {
      fields.push(`activity_id = $${paramIndex++}`);
      values.push(eventData.activity_id);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ a mettre a jour'));
    }

    values.push(id);

    const query = `UPDATE events SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id`;

    db.run(query, values, function(err) {
      if (err) {
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
 * Supprime un evenement
 */
const deleteEvent = (db, id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM events WHERE id = $1', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Recupere les evenements d'une activite specifique
 */
const getEventsByActivity = (db, activityId) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT ${EVENT_COLUMNS} FROM events WHERE activity_id = $1 ORDER BY start_datetime ASC`;

    db.all(query, [activityId], (err, events) => {
      if (err) {
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Recupere les evenements dans une plage de dates
 */
const getEventsInRange = (db, startDate, endDate) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT ${EVENT_COLUMNS} FROM events
      WHERE start_datetime >= $1 AND end_datetime <= $2
      ORDER BY start_datetime ASC
    `;

    db.all(query, [startDate, endDate], (err, events) => {
      if (err) {
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Recupere les evenements a venir
 */
const getUpcomingEvents = (db, limit = 10) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const query = `
      SELECT ${EVENT_COLUMNS} FROM events
      WHERE start_datetime >= $1
      ORDER BY start_datetime ASC
      LIMIT $2
    `;

    db.all(query, [now, limit], (err, events) => {
      if (err) {
        reject(err);
      } else {
        resolve(events || []);
      }
    });
  });
};

/**
 * Cree un evenement recurrent avec ses parametres de recurrence
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
      return reject(new Error('Titre et date de debut sont requis'));
    }

    if (!recurrence_type || recurrence_type === 'NONE') {
      return reject(new Error('Type de recurrence requis pour un evenement recurrent'));
    }

    const query = `
      INSERT INTO events (
        title, description, start_datetime, end_datetime, all_day,
        location, category, priority, color, reminder_time, activity_id,
        recurrence_type, recurrence_interval, recurrence_days,
        recurrence_end_type, recurrence_end_date, recurrence_count,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.get(
      query,
      [
        title,
        description || null,
        start_datetime,
        end_datetime || start_datetime,
        all_day ? true : false,
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
      function(err, result) {
        if (err) {
          reject(err);
        } else {
          const newId = result?.id || this.lastID;
          getEventById(db, newId)
            .then(event => resolve(event))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Recupere les exceptions d'un evenement recurrent
 */
const getEventExceptions = (db, eventId) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT exception_date FROM event_exceptions WHERE parent_event_id = $1';

    db.all(query, [eventId], (err, exceptions) => {
      if (err) {
        reject(err);
      } else {
        resolve((exceptions || []).map(e => e.exception_date));
      }
    });
  });
};

/**
 * Ajoute une exception
 */
const addEventException = (db, eventId, exceptionDate) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO event_exceptions (parent_event_id, exception_date, created_at)
      VALUES ($1, $2, $3)
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.get(query, [eventId, exceptionDate, now], function(err, result) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, id: result?.id || this.lastID });
      }
    });
  });
};

/**
 * Supprime une exception
 */
const removeEventException = (db, eventId, exceptionDate) => {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM event_exceptions WHERE parent_event_id = $1 AND exception_date = $2';

    db.run(query, [eventId, exceptionDate], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Cree une modification specifique d'une occurrence
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.get(
      query,
      [
        title,
        description || null,
        start_datetime,
        end_datetime || start_datetime,
        all_day ? true : false,
        location || null,
        category || null,
        priority || null,
        color || null,
        reminder_time || null,
        parentEventId,
        true,
        exceptionDate,
        now
      ],
      function(err, result) {
        if (err) {
          reject(err);
        } else {
          const newId = result?.id || this.lastID;
          getEventById(db, newId)
            .then(event => resolve(event))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Recupere toutes les occurrences modifiees d'un evenement recurrent
 */
const getModifiedOccurrences = (db, eventId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT ${EVENT_COLUMNS} FROM events
      WHERE parent_event_id = $1 AND is_exception = true
      ORDER BY exception_date ASC
    `;

    db.all(query, [eventId], (err, events) => {
      if (err) {
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
