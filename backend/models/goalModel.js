// backend/models/goalModel.js

/**
 * Récupère tous les objectifs
 */
const getAllGoals = (db) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM goals ORDER BY start_date DESC';

    db.all(query, [], (err, goals) => {
      if (err) {
        console.error('[GoalModel] Erreur lors de la récupération des objectifs:', err);
        reject(err);
      } else {
        resolve(goals || []);
      }
    });
  });
};

/**
 * Récupère un objectif par son ID avec ses milestones
 */
const getGoalById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
      if (err) {
        console.error('[GoalModel] Erreur lors de la récupération de l\'objectif:', err);
        return reject(err);
      }

      if (!goal) {
        return resolve(null);
      }

      // Récupérer les milestones associées
      db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id', [id], (milestoneErr, milestones) => {
        if (milestoneErr) {
          console.error('[GoalModel] Erreur lors de la récupération des milestones:', milestoneErr);
          goal.milestones = [];
        } else {
          goal.milestones = milestones || [];
        }

        resolve(goal);
      });
    });
  });
};

/**
 * Crée un nouvel objectif
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
      return reject(new Error('Nom, valeur cible, catégorie, période, date de début et date de fin sont requis'));
    }

    const query = `
      INSERT INTO goals (
        name, description, target_value, current_value,
        category, period, start_date, end_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [name, description || null, target_value, current_value, category, period, start_date, end_date, now, now],
      function(err) {
        if (err) {
          console.error('[GoalModel] Erreur lors de la création de l\'objectif:', err);
          reject(err);
        } else {
          getGoalById(db, this.lastID)
            .then(goal => resolve(goal))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met à jour un objectif
 */
const updateGoal = (db, id, goalData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (goalData.name !== undefined && goalData.name !== '') {
      fields.push('name = ?');
      values.push(goalData.name);
    }
    if (goalData.description !== undefined) {
      fields.push('description = ?');
      values.push(goalData.description);
    }
    if (goalData.target_value !== undefined && !isNaN(parseFloat(goalData.target_value))) {
      fields.push('target_value = ?');
      values.push(parseFloat(goalData.target_value));
    }
    if (goalData.current_value !== undefined && !isNaN(parseFloat(goalData.current_value))) {
      fields.push('current_value = ?');
      values.push(parseFloat(goalData.current_value));
    }
    if (goalData.category !== undefined && goalData.category !== '') {
      fields.push('category = ?');
      values.push(goalData.category);
    }
    if (goalData.period !== undefined && goalData.period !== '') {
      fields.push('period = ?');
      values.push(goalData.period);
    }
    if (goalData.start_date !== undefined && goalData.start_date !== '') {
      fields.push('start_date = ?');
      values.push(goalData.start_date);
    }
    if (goalData.end_date !== undefined && goalData.end_date !== '') {
      fields.push('end_date = ?');
      values.push(goalData.end_date);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Ajouter la date de mise à jour
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    // Ajouter l'ID pour la clause WHERE
    values.push(id);

    const query = `UPDATE goals SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[GoalModel] Erreur lors de la mise à jour de l\'objectif:', err);
        reject(err);
      } else {
        // Si current_value a été modifié, mettre à jour les milestones
        if (goalData.current_value !== undefined) {
          updateMilestonesAchievement(db, id, goalData.current_value)
            .catch(err => console.error('[GoalModel] Erreur lors de la mise à jour des milestones:', err));
        }

        // Récupérer l'objectif mis à jour avec ses milestones
        getGoalById(db, id)
          .then(goal => resolve(goal))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Met à jour uniquement la progression (current_value) d'un objectif
 */
const updateGoalProgress = (db, id, current_value) => {
  return new Promise((resolve, reject) => {
    if (current_value === undefined) {
      return reject(new Error('Valeur actuelle requise'));
    }

    const query = `
      UPDATE goals
      SET current_value = ?, updated_at = ?
      WHERE id = ?
    `;

    const now = new Date().toISOString();

    db.run(query, [current_value, now, id], function(err) {
      if (err) {
        console.error('[GoalModel] Erreur lors de la mise à jour de la progression:', err);
        reject(err);
      } else {
        // Mettre à jour les milestones
        updateMilestonesAchievement(db, id, current_value)
          .then(() => {
            // Récupérer l'objectif mis à jour avec ses milestones
            return getGoalById(db, id);
          })
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
    db.run('DELETE FROM goals WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('[GoalModel] Erreur lors de la suppression de l\'objectif:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Récupère toutes les milestones d'un objectif
 */
const getGoalMilestones = (db, goalId) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM milestones WHERE goal_id = ? ORDER BY id';

    db.all(query, [goalId], (err, milestones) => {
      if (err) {
        console.error('[GoalModel] Erreur lors de la récupération des milestones:', err);
        reject(err);
      } else {
        resolve(milestones || []);
      }
    });
  });
};

/**
 * Crée une nouvelle milestone pour un objectif
 */
const createMilestone = (db, goalId, milestoneData) => {
  return new Promise((resolve, reject) => {
    const { name, target } = milestoneData;

    if (!name || target === undefined) {
      return reject(new Error('Nom et valeur cible sont requis'));
    }

    // Récupérer l'objectif pour vérifier la progression actuelle
    db.get('SELECT current_value FROM goals WHERE id = ?', [goalId], (err, goal) => {
      if (err) {
        console.error('[GoalModel] Erreur lors de la récupération de l\'objectif:', err);
        return reject(err);
      }

      if (!goal) {
        return reject(new Error('Objectif non trouvé'));
      }

      // Déterminer si la milestone est déjà atteinte
      const achieved = goal.current_value >= target;

      const query = `
        INSERT INTO milestones (goal_id, name, target, achieved)
        VALUES (?, ?, ?, ?)
      `;

      db.run(query, [goalId, name, target, achieved], function(err) {
        if (err) {
          console.error('[GoalModel] Erreur lors de la création de la milestone:', err);
          reject(err);
        } else {
          db.get('SELECT * FROM milestones WHERE id = ?', [this.lastID], (err, milestone) => {
            if (err) {
              console.error('[GoalModel] Erreur lors de la récupération de la milestone créée:', err);
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
 * Met à jour une milestone
 */
const updateMilestone = (db, milestoneId, goalId, milestoneData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (milestoneData.name !== undefined && milestoneData.name !== '') {
      fields.push('name = ?');
      values.push(milestoneData.name);
    }
    if (milestoneData.target !== undefined && !isNaN(parseFloat(milestoneData.target))) {
      fields.push('target = ?');
      values.push(parseFloat(milestoneData.target));
    }
    if (milestoneData.achieved !== undefined) {
      fields.push('achieved = ?');
      values.push(milestoneData.achieved ? true : false);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Ajouter les IDs pour la clause WHERE
    values.push(milestoneId);
    values.push(goalId);

    const query = `
      UPDATE milestones
      SET ${fields.join(', ')}
      WHERE id = ? AND goal_id = ?
    `;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[GoalModel] Erreur lors de la mise à jour de la milestone:', err);
        reject(err);
      } else {
        db.get('SELECT * FROM milestones WHERE id = ?', [milestoneId], (err, milestone) => {
          if (err) {
            console.error('[GoalModel] Erreur lors de la récupération de la milestone mise à jour:', err);
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
    db.run(
      'DELETE FROM milestones WHERE id = ? AND goal_id = ?',
      [milestoneId, goalId],
      function(err) {
        if (err) {
          console.error('[GoalModel] Erreur lors de la suppression de la milestone:', err);
          reject(err);
        } else {
          resolve({ success: true, changes: this.changes });
        }
      }
    );
  });
};

/**
 * Vérifie si une milestone existe et appartient à un objectif
 */
const checkMilestoneExists = (db, milestoneId, goalId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM milestones WHERE id = ? AND goal_id = ?',
      [milestoneId, goalId],
      (err, milestone) => {
        if (err) {
          console.error('[GoalModel] Erreur lors de la vérification de la milestone:', err);
          reject(err);
        } else {
          resolve(milestone);
        }
      }
    );
  });
};

/**
 * Met à jour le statut achieved des milestones en fonction de current_value
 */
const updateMilestonesAchievement = (db, goalId, current_value) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE milestones
      SET achieved = CASE WHEN target <= ? THEN true ELSE false END
      WHERE goal_id = ?
    `;

    db.run(query, [current_value, goalId], function(err) {
      if (err) {
        console.error('[GoalModel] Erreur lors de la mise à jour des milestones:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
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
  updateMilestonesAchievement
};
