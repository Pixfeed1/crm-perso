// backend/models/activityModel.js
// Converti en PostgreSQL natif ($1, $2, etc.)


/**
 * Recuperer toutes les activites
 */
const getAllActivities = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        a.*,
        p.name as project_name,
        l.name as lead_name
      FROM activities a
      LEFT JOIN projects p ON a.project_id = p.id
      LEFT JOIN leads l ON a.lead_id = l.id
      ORDER BY a.date DESC
    `;

    db.all(query, [], (err, activities) => {
      if (err) reject(err);
      else resolve(activities || []);
    });
  });
};

/**
 * Recuperer une activite par son ID
 */
const getActivityById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        a.*,
        p.name as project_name,
        l.name as lead_name
      FROM activities a
      LEFT JOIN projects p ON a.project_id = p.id
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.id = $1
    `;

    db.get(query, [id], (err, activity) => {
      if (err) reject(err);
      else resolve(activity || null);
    });
  });
};

/**
 * Creer une nouvelle activite
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;

    db.get(query, [
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
    ], function(err, result) {
      if (err) {
        reject(err);
      } else {
        const newActivityId = result?.id || this.lastID;

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
 * Mettre a jour une activite (requete dynamique)
 */
const updateActivity = (db, id, updateData) => {
  return new Promise((resolve, reject) => {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (updateData.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      params.push(updateData.type);
    }
    if (updateData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(updateData.description);
    }
    if (updateData.planned_time !== undefined) {
      updates.push(`planned_time = $${paramIndex++}`);
      params.push(updateData.planned_time);
    }
    if (updateData.actual_time !== undefined) {
      updates.push(`actual_time = $${paramIndex++}`);
      params.push(updateData.actual_time);
    }
    if (updateData.date !== undefined) {
      updates.push(`date = $${paramIndex++}`);
      params.push(updateData.date);
    }
    if (updateData.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(updateData.priority);
    }
    if (updateData.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(updateData.status);
    }
    if (updateData.project_id !== undefined) {
      updates.push(`project_id = $${paramIndex++}`);
      params.push(updateData.project_id);
    }
    if (updateData.lead_id !== undefined) {
      updates.push(`lead_id = $${paramIndex++}`);
      params.push(updateData.lead_id);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    params.push(id);

    const query = `
      UPDATE activities
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id
    `;

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Activite non trouvee'));
      } else {
        getActivityById(db, id).then(resolve).catch(reject);
      }
    });
  });
};

/**
 * Marquer une activite comme terminee
 */
const completeActivity = (db, id, actualTime) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE activities
      SET status = 'completed', actual_time = $1, updated_at = $2
      WHERE id = $3
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.run(query, [actualTime || 0, now, id], function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Activite non trouvee'));
      } else {
        getActivityById(db, id).then(resolve).catch(reject);
      }
    });
  });
};

/**
 * Supprimer une activite
 */
const deleteActivity = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM activities WHERE id = $1';

    db.run(query, [id], function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Activite non trouvee'));
      } else {
        resolve({ id, changes: this.changes });
      }
    });
  });
};

/**
 * Recuperer les activites recentes
 */
const getRecentActivities = (db, limit = 5) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        a.*,
        p.name as project_name,
        l.name as lead_name
      FROM activities a
      LEFT JOIN projects p ON a.project_id = p.id
      LEFT JOIN leads l ON a.lead_id = l.id
      ORDER BY a.date DESC
      LIMIT $1
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
