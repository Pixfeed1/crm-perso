// backend/models/reminderModel.js

/**
 * Récupère tous les rappels actifs (status = 'pending')
 */
const getActiveReminders = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM reminders
      WHERE status = 'pending'
      ORDER BY due_date ASC
    `;

    db.all(query, [], (err, reminders) => {
      if (err) {
        console.error('[ReminderModel] Erreur lors de la récupération des rappels actifs:', err);
        reject(err);
      } else {
        resolve(reminders || []);
      }
    });
  });
};

/**
 * Récupère les rappels en retard (due_date passée et status = 'pending')
 */
const getOverdueReminders = (db) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const query = `
      SELECT * FROM reminders
      WHERE status = 'pending' AND due_date < ?
      ORDER BY due_date ASC
    `;

    db.all(query, [now], (err, reminders) => {
      if (err) {
        console.error('[ReminderModel] Erreur lors de la récupération des rappels en retard:', err);
        reject(err);
      } else {
        resolve(reminders || []);
      }
    });
  });
};

/**
 * Récupère les rappels à venir dans les X prochains jours
 */
const getUpcomingReminders = (db, days = 7) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const futureDateStr = futureDate.toISOString();

    const query = `
      SELECT * FROM reminders
      WHERE status = 'pending'
        AND due_date >= ?
        AND due_date <= ?
      ORDER BY due_date ASC
    `;

    db.all(query, [now, futureDateStr], (err, reminders) => {
      if (err) {
        console.error('[ReminderModel] Erreur lors de la récupération des rappels à venir:', err);
        reject(err);
      } else {
        resolve(reminders || []);
      }
    });
  });
};

/**
 * Récupère tous les rappels pour une entité spécifique
 */
const getRemindersByEntity = (db, entityType, entityId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM reminders
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY due_date ASC
    `;

    db.all(query, [entityType, entityId], (err, reminders) => {
      if (err) {
        console.error('[ReminderModel] Erreur lors de la récupération des rappels pour l\'entité:', err);
        reject(err);
      } else {
        resolve(reminders || []);
      }
    });
  });
};

/**
 * Récupère un rappel par son ID
 */
const getReminderById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM reminders WHERE id = ?';

    db.get(query, [id], (err, reminder) => {
      if (err) {
        console.error('[ReminderModel] Erreur lors de la récupération du rappel:', err);
        reject(err);
      } else {
        resolve(reminder);
      }
    });
  });
};

/**
 * Crée un nouveau rappel
 */
const createReminder = (db, reminderData) => {
  return new Promise((resolve, reject) => {
    const {
      entity_type,
      entity_id,
      title,
      description,
      due_date,
      priority = 'medium'
    } = reminderData;

    const query = `
      INSERT INTO reminders (
        entity_type, entity_id, title, description, due_date,
        priority, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [entity_type, entity_id, title, description || '', due_date, priority, now],
      function(err) {
        if (err) {
          console.error('[ReminderModel] Erreur lors de la création du rappel:', err);
          reject(err);
        } else {
          getReminderById(db, this.lastID)
            .then(reminder => resolve(reminder))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met à jour un rappel
 */
const updateReminder = (db, id, reminderData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (reminderData.title !== undefined) {
      fields.push('title = ?');
      values.push(reminderData.title);
    }
    if (reminderData.description !== undefined) {
      fields.push('description = ?');
      values.push(reminderData.description);
    }
    if (reminderData.due_date !== undefined) {
      fields.push('due_date = ?');
      values.push(reminderData.due_date);
    }
    if (reminderData.priority !== undefined) {
      fields.push('priority = ?');
      values.push(reminderData.priority);
    }
    if (reminderData.status !== undefined) {
      fields.push('status = ?');
      values.push(reminderData.status);

      // Si status est 'completed', ajouter completed_at
      if (reminderData.status === 'completed') {
        fields.push('completed_at = ?');
        values.push(new Date().toISOString());
      }

      // Si status est 'dismissed', ajouter dismissed_at
      if (reminderData.status === 'dismissed') {
        fields.push('dismissed_at = ?');
        values.push(new Date().toISOString());
      }
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    values.push(id);
    const query = `UPDATE reminders SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[ReminderModel] Erreur lors de la mise à jour du rappel:', err);
        reject(err);
      } else {
        getReminderById(db, id)
          .then(reminder => resolve(reminder))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Marque un rappel comme complété
 */
const completeReminder = (db, id) => {
  return updateReminder(db, id, { status: 'completed' });
};

/**
 * Rejette/dismiss un rappel
 */
const dismissReminder = (db, id) => {
  return updateReminder(db, id, { status: 'dismissed' });
};

/**
 * Supprime un rappel
 */
const deleteReminder = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM reminders WHERE id = ?';

    db.run(query, [id], function(err) {
      if (err) {
        console.error('[ReminderModel] Erreur lors de la suppression du rappel:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Compte le nombre de rappels actifs
 */
const countActiveReminders = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT COUNT(*) as count
      FROM reminders
      WHERE status = 'pending'
    `;

    db.get(query, [], (err, result) => {
      if (err) {
        console.error('[ReminderModel] Erreur lors du comptage des rappels actifs:', err);
        reject(err);
      } else {
        resolve(result.count);
      }
    });
  });
};

/**
 * Compte le nombre de rappels en retard
 */
const countOverdueReminders = (db) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const query = `
      SELECT COUNT(*) as count
      FROM reminders
      WHERE status = 'pending' AND due_date < ?
    `;

    db.get(query, [now], (err, result) => {
      if (err) {
        console.error('[ReminderModel] Erreur lors du comptage des rappels en retard:', err);
        reject(err);
      } else {
        resolve(result.count);
      }
    });
  });
};

module.exports = {
  getActiveReminders,
  getOverdueReminders,
  getUpcomingReminders,
  getRemindersByEntity,
  getReminderById,
  createReminder,
  updateReminder,
  completeReminder,
  dismissReminder,
  deleteReminder,
  countActiveReminders,
  countOverdueReminders
};
