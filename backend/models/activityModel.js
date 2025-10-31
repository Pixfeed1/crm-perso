// backend/models/activityModel.js

/**
 * Modèle pour la gestion des activités
 * Pattern standardisé: chaque fonction prend db comme premier paramètre
 */

/**
 * Récupérer toutes les activités
 * @param {object} db - Instance de la base de données
 * @returns {Promise} - Promesse contenant les activités
 */
const getAllActivities = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        a.*,
        p.name as project_name,
        l.name as lead_name
      FROM
        activities a
      LEFT JOIN
        projects p ON a.project_id = p.id
      LEFT JOIN
        leads l ON a.lead_id = l.id
      ORDER BY
        a.date DESC
    `;

    db.all(query, [], (err, activities) => {
      if (err) reject(err);
      else resolve(activities || []);
    });
  });
};

/**
 * Récupérer une activité par son ID
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID de l'activité
 * @returns {Promise} - Promesse contenant l'activité
 */
const getActivityById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        a.*,
        p.name as project_name,
        l.name as lead_name
      FROM
        activities a
      LEFT JOIN
        projects p ON a.project_id = p.id
      LEFT JOIN
        leads l ON a.lead_id = l.id
      WHERE
        a.id = ?
    `;

    db.get(query, [id], (err, activity) => {
      if (err) reject(err);
      else resolve(activity || null);
    });
  });
};

/**
 * Créer une nouvelle activité
 * @param {object} db - Instance de la base de données
 * @param {object} activityData - Données de l'activité
 * @returns {Promise} - Promesse contenant l'activité créée
 */
const createActivity = (db, activityData) => {
  return new Promise((resolve, reject) => {
    const {
      type,
      description,
      planned_time,
      actual_time,
      date,
      priority,
      status,
      project_id,
      lead_id
    } = activityData;

    if (!type || !description || !date) {
      return reject(new Error('Type, description et date sont requis'));
    }

    const now = new Date().toISOString();
    const query = `
      INSERT INTO activities (
        type, description, planned_time, actual_time, date,
        priority, status, project_id, lead_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [
      type,
      description,
      planned_time || 0,
      actual_time || 0,
      date,
      priority || 'medium',
      status || 'planned',
      project_id || null,
      lead_id || null,
      now,
      now
    ], function(err) {
      if (err) {
        reject(err);
      } else {
        const newActivityId = this.lastID;

        // Récupérer l'activité créée
        getActivityById(db, newActivityId)
          .then(resolve)
          .catch(() => {
            resolve({
              id: newActivityId,
              ...activityData,
              created_at: now,
              updated_at: now
            });
          });
      }
    });
  });
};

/**
 * Mettre à jour une activité
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID de l'activité
 * @param {object} updateData - Données à mettre à jour
 * @returns {Promise} - Promesse contenant l'activité mise à jour
 */
const updateActivity = (db, id, updateData) => {
  return new Promise((resolve, reject) => {
    // Construire la requête dynamiquement
    const updates = [];
    const params = [];

    if (updateData.type !== undefined) {
      updates.push('type = ?');
      params.push(updateData.type);
    }

    if (updateData.description !== undefined) {
      updates.push('description = ?');
      params.push(updateData.description);
    }

    if (updateData.planned_time !== undefined) {
      updates.push('planned_time = ?');
      params.push(updateData.planned_time);
    }

    if (updateData.actual_time !== undefined) {
      updates.push('actual_time = ?');
      params.push(updateData.actual_time);
    }

    if (updateData.date !== undefined) {
      updates.push('date = ?');
      params.push(updateData.date);
    }

    if (updateData.priority !== undefined) {
      updates.push('priority = ?');
      params.push(updateData.priority);
    }

    if (updateData.status !== undefined) {
      updates.push('status = ?');
      params.push(updateData.status);
    }

    if (updateData.project_id !== undefined) {
      updates.push('project_id = ?');
      params.push(updateData.project_id);
    }

    if (updateData.lead_id !== undefined) {
      updates.push('lead_id = ?');
      params.push(updateData.lead_id);
    }

    // Ajouter la date de mise à jour
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    // Ajouter l'ID
    params.push(id);

    const query = `
      UPDATE activities
      SET ${updates.join(', ')}
      WHERE id = ?
    `;

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Activité non trouvée'));
      } else {
        // Récupérer l'activité mise à jour
        getActivityById(db, id).then(resolve).catch(reject);
      }
    });
  });
};

/**
 * Marquer une activité comme terminée
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID de l'activité
 * @param {number} actualTime - Temps réel passé (optionnel)
 * @returns {Promise} - Promesse contenant l'activité mise à jour
 */
const completeActivity = (db, id, actualTime) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE activities
      SET
        status = 'completed',
        actual_time = ?,
        updated_at = ?
      WHERE id = ?
    `;

    const now = new Date().toISOString();

    db.run(query, [actualTime || 0, now, id], function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Activité non trouvée'));
      } else {
        // Récupérer l'activité mise à jour
        getActivityById(db, id).then(resolve).catch(reject);
      }
    });
  });
};

/**
 * Supprimer une activité
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID de l'activité
 * @returns {Promise} - Promesse de succès
 */
const deleteActivity = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM activities WHERE id = ?';

    db.run(query, [id], function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Activité non trouvée'));
      } else {
        resolve({ id, changes: this.changes });
      }
    });
  });
};

/**
 * Récupérer les activités récentes
 * @param {object} db - Instance de la base de données
 * @param {number} limit - Nombre d'activités à récupérer
 * @returns {Promise} - Promesse contenant les activités récentes
 */
const getRecentActivities = (db, limit = 5) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        a.*,
        p.name as project_name,
        l.name as lead_name
      FROM
        activities a
      LEFT JOIN
        projects p ON a.project_id = p.id
      LEFT JOIN
        leads l ON a.lead_id = l.id
      ORDER BY
        a.date DESC
      LIMIT ?
    `;

    db.all(query, [limit], (err, activities) => {
      if (err) reject(err);
      else resolve(activities || []);
    });
  });
};

module.exports = {
  getAllActivities,
  getActivityById,
  createActivity,
  updateActivity,
  completeActivity,
  deleteActivity,
  getRecentActivities
};
