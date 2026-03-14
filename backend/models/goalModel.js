// backend/models/goalModel.js
// Converti en PostgreSQL natif ($1, $2, etc.)

const GOAL_COLUMNS = 'id, name, description, target_value, current_value, category, period, start_date, end_date, status, is_archived, created_at, updated_at';
const MILESTONE_COLUMNS = 'id, goal_id, name, target, achieved';

/**
 * Recupere tous les objectifs
 */
const getAllGoals = (db) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT ${GOAL_COLUMNS} FROM goals ORDER BY start_date DESC`;

    db.all(query, [], (err, goals) => {
      if (err) {
        reject(err);
      } else {
        resolve(goals || []);
      }
    });
  });
};

/**
 * Recupere un objectif par son ID avec ses milestones
 */
const getGoalById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT ${GOAL_COLUMNS} FROM goals WHERE id = $1`, [id], (err, goal) => {
      if (err) {
        return reject(err);
      }

      if (!goal) {
        return resolve(null);
      }

      db.all(`SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE goal_id = $1 ORDER BY id`, [id], (milestoneErr, milestones) => {
        goal.milestones = milestoneErr ? [] : (milestones || []);
        resolve(goal);
      });
    });
  });
};

/**
 * Cree un nouvel objectif
 */
const createGoal = (db, goalData) => {
  return new Promise((resolve, reject) => {
    const {
      name,
      description,
      target_value,
      current_value = 0,
      category,
      period,
      start_date,
      end_date
    } = goalData;

    if (!name || !target_value || !category || !period || !start_date || !end_date) {
      return reject(new Error('Nom, valeur cible, categorie, periode, date de debut et date de fin sont requis'));
    }

    const query = `
      INSERT INTO goals (
        name, description, target_value, current_value,
        category, period, start_date, end_date,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.get(
      query,
      [name, description || null, target_value, current_value, category, period, start_date, end_date, now, now],
      function(err, result) {
        if (err) {
          reject(err);
        } else {
          const newId = result?.id || this.lastID;
          getGoalById(db, newId)
            .then(goal => resolve(goal))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met a jour un objectif (requete dynamique)
 */
const updateGoal = (db, id, goalData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (goalData.name !== undefined && goalData.name !== '') {
      fields.push(`name = $${paramIndex++}`);
      values.push(goalData.name);
    }
    if (goalData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(goalData.description);
    }
    if (goalData.target_value !== undefined && !isNaN(parseFloat(goalData.target_value))) {
      fields.push(`target_value = $${paramIndex++}`);
      values.push(parseFloat(goalData.target_value));
    }
    if (goalData.current_value !== undefined && !isNaN(parseFloat(goalData.current_value))) {
      fields.push(`current_value = $${paramIndex++}`);
      values.push(parseFloat(goalData.current_value));
    }
    if (goalData.category !== undefined && goalData.category !== '') {
      fields.push(`category = $${paramIndex++}`);
      values.push(goalData.category);
    }
    if (goalData.period !== undefined && goalData.period !== '') {
      fields.push(`period = $${paramIndex++}`);
      values.push(goalData.period);
    }
    if (goalData.start_date !== undefined && goalData.start_date !== '') {
      fields.push(`start_date = $${paramIndex++}`);
      values.push(goalData.start_date);
    }
    if (goalData.end_date !== undefined && goalData.end_date !== '') {
      fields.push(`end_date = $${paramIndex++}`);
      values.push(goalData.end_date);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ a mettre a jour'));
    }

    fields.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());

    values.push(id);

    const query = `UPDATE goals SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id`;

    db.run(query, values, function(err) {
      if (err) {
        reject(err);
      } else {
        if (goalData.current_value !== undefined) {
          updateMilestonesAchievement(db, id, goalData.current_value).catch(() => {});
        }

        getGoalById(db, id)
          .then(goal => resolve(goal))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Met a jour uniquement la progression d'un objectif
 */
const updateGoalProgress = (db, id, current_value) => {
  return new Promise((resolve, reject) => {
    if (current_value === undefined) {
      return reject(new Error('Valeur actuelle requise'));
    }

    const query = `
      UPDATE goals
      SET current_value = $1, updated_at = $2
      WHERE id = $3
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.run(query, [current_value, now, id], function(err) {
      if (err) {
        reject(err);
      } else {
        updateMilestonesAchievement(db, id, current_value)
          .then(() => getGoalById(db, id))
          .then(goal => resolve(goal))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Supprime un objectif
 */
const deleteGoal = (db, id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM goals WHERE id = $1', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Recupere toutes les milestones d'un objectif
 */
const getGoalMilestones = (db, goalId) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE goal_id = $1 ORDER BY id`;

    db.all(query, [goalId], (err, milestones) => {
      if (err) {
        reject(err);
      } else {
        resolve(milestones || []);
      }
    });
  });
};

/**
 * Cree une nouvelle milestone pour un objectif
 */
const createMilestone = (db, goalId, milestoneData) => {
  return new Promise((resolve, reject) => {
    const { name, target } = milestoneData;

    if (!name || target === undefined) {
      return reject(new Error('Nom et valeur cible sont requis'));
    }

    db.get('SELECT current_value FROM goals WHERE id = $1', [goalId], (err, goal) => {
      if (err) {
        return reject(err);
      }

      if (!goal) {
        return reject(new Error('Objectif non trouve'));
      }

      const achieved = goal.current_value >= target;

      const query = `
        INSERT INTO milestones (goal_id, name, target, achieved)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;

      db.get(query, [goalId, name, target, achieved], function(err, result) {
        if (err) {
          reject(err);
        } else {
          const newId = result?.id || this.lastID;
          db.get(`SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE id = $1`, [newId], (err, milestone) => {
            if (err) {
              reject(err);
            } else {
              resolve(milestone);
            }
          });
        }
      });
    });
  });
};

/**
 * Met a jour une milestone (requete dynamique)
 */
const updateMilestone = (db, milestoneId, goalId, milestoneData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (milestoneData.name !== undefined && milestoneData.name !== '') {
      fields.push(`name = $${paramIndex++}`);
      values.push(milestoneData.name);
    }
    if (milestoneData.target !== undefined && !isNaN(parseFloat(milestoneData.target))) {
      fields.push(`target = $${paramIndex++}`);
      values.push(parseFloat(milestoneData.target));
    }
    if (milestoneData.achieved !== undefined) {
      fields.push(`achieved = $${paramIndex++}`);
      values.push(milestoneData.achieved ? true : false);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ a mettre a jour'));
    }

    values.push(milestoneId);
    values.push(goalId);

    const query = `
      UPDATE milestones
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND goal_id = $${paramIndex}
      RETURNING id
    `;

    db.run(query, values, function(err) {
      if (err) {
        reject(err);
      } else {
        db.get(`SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE id = $1`, [milestoneId], (err, milestone) => {
          if (err) {
            reject(err);
          } else {
            resolve(milestone);
          }
        });
      }
    });
  });
};

/**
 * Supprime une milestone
 */
const deleteMilestone = (db, milestoneId, goalId) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM milestones WHERE id = $1 AND goal_id = $2', [milestoneId, goalId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Verifie si une milestone existe et appartient a un objectif
 */
const checkMilestoneExists = (db, milestoneId, goalId) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE id = $1 AND goal_id = $2`, [milestoneId, goalId], (err, milestone) => {
      if (err) {
        reject(err);
      } else {
        resolve(milestone);
      }
    });
  });
};

/**
 * Met a jour le statut achieved des milestones en fonction de current_value
 */
const updateMilestonesAchievement = (db, goalId, current_value) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE milestones
      SET achieved = CASE WHEN target <= $1 THEN true ELSE false END
      WHERE goal_id = $2
    `;

    db.run(query, [current_value, goalId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Archiver un objectif
 */
const archiveGoal = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE goals
      SET is_archived = true, status = 'archived', updated_at = $1
      WHERE id = $2
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.run(query, [now, id], function(err) {
      if (err) {
        reject(err);
      } else {
        getGoalById(db, id)
          .then(goal => resolve(goal))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Desarchiver un objectif
 */
const unarchiveGoal = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE goals
      SET is_archived = false, status = 'active', updated_at = $1
      WHERE id = $2
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.run(query, [now, id], function(err) {
      if (err) {
        reject(err);
      } else {
        getGoalById(db, id)
          .then(goal => resolve(goal))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Dupliquer un objectif (avec nouvelles dates)
 */
const duplicateGoal = (db, id, newDates) => {
  return new Promise((resolve, reject) => {
    getGoalById(db, id)
      .then(originalGoal => {
        if (!originalGoal) {
          return reject(new Error('Objectif non trouve'));
        }

        const duplicateData = {
          name: originalGoal.name + ' (copie)',
          description: originalGoal.description,
          target_value: originalGoal.target_value,
          current_value: 0,
          category: originalGoal.category,
          period: originalGoal.period,
          start_date: newDates?.start_date || originalGoal.start_date,
          end_date: newDates?.end_date || originalGoal.end_date
        };

        return createGoal(db, duplicateData);
      })
      .then(newGoal => {
        getGoalMilestones(db, id)
          .then(milestones => {
            const milestonePromises = milestones.map(m =>
              createMilestone(db, newGoal.id, { name: m.name, target: m.target })
            );
            return Promise.all(milestonePromises).then(() => newGoal);
          })
          .then(goal => getGoalById(db, goal.id))
          .then(goal => resolve(goal))
          .catch(() => resolve(newGoal));
      })
      .catch(err => reject(err));
  });
};

/**
 * Recupere les objectifs archives
 */
const getArchivedGoals = (db) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT ${GOAL_COLUMNS} FROM goals WHERE is_archived = true ORDER BY updated_at DESC`;

    db.all(query, [], (err, goals) => {
      if (err) {
        resolve([]);
      } else {
        resolve(goals || []);
      }
    });
  });
};

/**
 * Marquer un objectif comme termine
 */
const completeGoal = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE goals
      SET status = 'completed', updated_at = $1
      WHERE id = $2
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.run(query, [now, id], function(err) {
      if (err) {
        reject(err);
      } else {
        getGoalById(db, id)
          .then(goal => resolve(goal))
          .catch(err => reject(err));
      }
    });
  });
};

module.exports = {
  getAllGoals,
  getGoalById,
  createGoal,
  updateGoal,
  updateGoalProgress,
  deleteGoal,
  getGoalMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  checkMilestoneExists,
  updateMilestonesAchievement,
  archiveGoal,
  unarchiveGoal,
  duplicateGoal,
  getArchivedGoals,
  completeGoal
};
