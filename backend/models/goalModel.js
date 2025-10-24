// backend/models/goalModel.js

/**
 * Modèle pour la gestion des objectifs (goals) et leurs étapes (milestones)
 */
const db = require('../config/pgConfig');

const goalModel = {
  /**
   * Récupérer tous les objectifs
   * @returns {Promise<Array>} Liste des objectifs
   */
  getAllGoals: () => {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM goals ORDER BY start_date DESC';

      db.all(query, [], (err, goals) => {
        if (err) {
          console.error('[GoalModel] Erreur lors de la récupération des objectifs:', err);
          reject(new Error('Erreur serveur lors de la récupération des objectifs: ' + err.message));
        } else {
          resolve(goals);
        }
      });
    });
  },

  /**
   * Récupérer un objectif par son ID avec ses étapes
   * @param {number} id - ID de l'objectif
   * @returns {Promise<Object>} Objectif avec ses milestones
   */
  getGoalById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
        if (err) {
          console.error(`[GoalModel] Erreur lors de la récupération de l'objectif ${id}:`, err);
          reject(new Error('Erreur serveur lors de la récupération de l\'objectif: ' + err.message));
        } else if (!goal) {
          resolve(null);
        } else {
          // Récupérer les étapes (milestones) associées
          db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id', [id], (milestoneErr, milestones) => {
            if (milestoneErr) {
              console.error(`[GoalModel] Erreur lors de la récupération des étapes de l'objectif ${id}:`, milestoneErr);
              goal.milestones = [];
            } else {
              goal.milestones = milestones || [];
            }

            resolve(goal);
          });
        }
      });
    });
  },

  /**
   * Créer un nouvel objectif
   * @param {Object} goalData - Données de l'objectif
   * @returns {Promise<Object>} Objectif créé
   */
  createGoal: (goalData) => {
    return new Promise((resolve, reject) => {
      const {
        name,
        description,
        target_value,
        current_value,
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

      db.run(query, [
        name,
        description || null,
        target_value,
        current_value || 0,
        category,
        period,
        start_date,
        end_date,
        now,
        now
      ], function(err) {
        if (err) {
          console.error('[GoalModel] Erreur lors de la création de l\'objectif:', err);
          reject(new Error('Erreur serveur lors de la création de l\'objectif: ' + err.message));
        } else {
          const newGoalId = this.lastID;

          // Récupérer l'objectif créé
          db.get('SELECT * FROM goals WHERE id = ?', [newGoalId], (err, goal) => {
            if (err) {
              console.error('[GoalModel] Erreur lors de la récupération de l\'objectif créé:', err);
              resolve({ id: newGoalId, ...goalData, milestones: [] });
            } else {
              goal.milestones = [];
              resolve(goal);
            }
          });
        }
      });
    });
  },

  /**
   * Mettre à jour un objectif
   * @param {number} id - ID de l'objectif
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Objectif mis à jour
   */
  updateGoal: (id, updateData) => {
    return new Promise((resolve, reject) => {
      // Vérifier si l'objectif existe
      db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
        if (err) {
          console.error(`[GoalModel] Erreur lors de la vérification de l'objectif ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!goal) {
          return reject(new Error('Objectif non trouvé'));
        }

        // Construire la requête de mise à jour
        const updates = [];
        const params = [];

        if (updateData.name !== undefined) {
          updates.push('name = ?');
          params.push(updateData.name);
        }

        if (updateData.description !== undefined) {
          updates.push('description = ?');
          params.push(updateData.description);
        }

        if (updateData.target_value !== undefined) {
          updates.push('target_value = ?');
          params.push(updateData.target_value);
        }

        if (updateData.current_value !== undefined) {
          updates.push('current_value = ?');
          params.push(updateData.current_value);
        }

        if (updateData.category !== undefined) {
          updates.push('category = ?');
          params.push(updateData.category);
        }

        if (updateData.period !== undefined) {
          updates.push('period = ?');
          params.push(updateData.period);
        }

        if (updateData.start_date !== undefined) {
          updates.push('start_date = ?');
          params.push(updateData.start_date);
        }

        if (updateData.end_date !== undefined) {
          updates.push('end_date = ?');
          params.push(updateData.end_date);
        }

        // Ajouter la date de mise à jour
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());

        // Ajouter l'ID pour la clause WHERE
        params.push(id);

        const query = `
          UPDATE goals
          SET ${updates.join(', ')}
          WHERE id = ?
        `;

        db.run(query, params, function(err) {
          if (err) {
            console.error(`[GoalModel] Erreur lors de la mise à jour de l'objectif ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            // Si current_value a été modifié, mettre à jour les milestones
            if (updateData.current_value !== undefined && goal.current_value !== updateData.current_value) {
              const updateMilestonesQuery = `
                UPDATE milestones
                SET achieved = CASE WHEN target <= ? THEN 1 ELSE 0 END
                WHERE goal_id = ?
              `;

              db.run(updateMilestonesQuery, [updateData.current_value, id], (milestoneErr) => {
                if (milestoneErr) {
                  console.error('[GoalModel] Erreur lors de la mise à jour des étapes:', milestoneErr);
                  // Continuer malgré l'erreur
                }
              });
            }

            // Récupérer l'objectif mis à jour avec ses milestones
            goalModel.getGoalById(id)
              .then(updatedGoal => resolve(updatedGoal))
              .catch(err => {
                console.error('[GoalModel] Erreur lors de la récupération de l\'objectif mis à jour:', err);
                resolve({ id, ...goal, ...updateData });
              });
          }
        });
      });
    });
  },

  /**
   * Mettre à jour uniquement la progression d'un objectif
   * @param {number} id - ID de l'objectif
   * @param {number} currentValue - Nouvelle valeur actuelle
   * @returns {Promise<Object>} Objectif mis à jour
   */
  updateProgress: (id, currentValue) => {
    return new Promise((resolve, reject) => {
      if (currentValue === undefined) {
        return reject(new Error('Valeur actuelle requise'));
      }

      // Vérifier si l'objectif existe
      db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
        if (err) {
          console.error(`[GoalModel] Erreur lors de la vérification de l'objectif ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!goal) {
          return reject(new Error('Objectif non trouvé'));
        }

        const query = `
          UPDATE goals
          SET current_value = ?, updated_at = ?
          WHERE id = ?
        `;

        const now = new Date().toISOString();

        db.run(query, [currentValue, now, id], function(err) {
          if (err) {
            console.error(`[GoalModel] Erreur lors de la mise à jour de la progression de l'objectif ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            // Mettre à jour les étapes
            const updateMilestonesQuery = `
              UPDATE milestones
              SET achieved = CASE WHEN target <= ? THEN 1 ELSE 0 END
              WHERE goal_id = ?
            `;

            db.run(updateMilestonesQuery, [currentValue, id], (milestoneErr) => {
              if (milestoneErr) {
                console.error('[GoalModel] Erreur lors de la mise à jour des étapes:', milestoneErr);
                // Continuer malgré l'erreur
              }

              // Récupérer l'objectif mis à jour
              goalModel.getGoalById(id)
                .then(updatedGoal => resolve(updatedGoal))
                .catch(err => {
                  console.error('[GoalModel] Erreur lors de la récupération de l\'objectif:', err);
                  resolve({ id, ...goal, current_value: currentValue });
                });
            });
          }
        });
      });
    });
  },

  /**
   * Supprimer un objectif
   * @param {number} id - ID de l'objectif
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteGoal: (id) => {
    return new Promise((resolve, reject) => {
      // Vérifier si l'objectif existe
      db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
        if (err) {
          console.error(`[GoalModel] Erreur lors de la vérification de l'objectif ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!goal) {
          return reject(new Error('Objectif non trouvé'));
        }

        // Supprimer l'objectif (les milestones seront supprimées automatiquement grâce à ON DELETE CASCADE)
        db.run('DELETE FROM goals WHERE id = ?', [id], function(err) {
          if (err) {
            console.error(`[GoalModel] Erreur lors de la suppression de l'objectif ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            resolve({ id, changes: this.changes });
          }
        });
      });
    });
  },

  // ==================== Gestion des milestones ====================

  /**
   * Récupérer les étapes d'un objectif
   * @param {number} goalId - ID de l'objectif
   * @returns {Promise<Array>} Liste des milestones
   */
  getMilestones: (goalId) => {
    return new Promise((resolve, reject) => {
      // Vérifier si l'objectif existe
      db.get('SELECT * FROM goals WHERE id = ?', [goalId], (err, goal) => {
        if (err) {
          console.error(`[GoalModel] Erreur lors de la vérification de l'objectif ${goalId}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!goal) {
          return reject(new Error('Objectif non trouvé'));
        }

        // Récupérer les milestones
        db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id', [goalId], (err, milestones) => {
          if (err) {
            console.error(`[GoalModel] Erreur lors de la récupération des étapes de l'objectif ${goalId}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            resolve(milestones || []);
          }
        });
      });
    });
  },

  /**
   * Ajouter une étape à un objectif
   * @param {number} goalId - ID de l'objectif
   * @param {Object} milestoneData - Données de l'étape
   * @returns {Promise<Object>} Milestone créée
   */
  addMilestone: (goalId, milestoneData) => {
    return new Promise((resolve, reject) => {
      const { name, target } = milestoneData;

      if (!name || target === undefined) {
        return reject(new Error('Nom et valeur cible sont requis'));
      }

      // Vérifier si l'objectif existe
      db.get('SELECT * FROM goals WHERE id = ?', [goalId], (err, goal) => {
        if (err) {
          console.error(`[GoalModel] Erreur lors de la vérification de l'objectif ${goalId}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!goal) {
          return reject(new Error('Objectif non trouvé'));
        }

        // Déterminer si l'étape est déjà atteinte
        const achieved = goal.current_value >= target ? 1 : 0;

        const query = `
          INSERT INTO milestones (goal_id, name, target, achieved)
          VALUES (?, ?, ?, ?)
        `;

        db.run(query, [goalId, name, target, achieved], function(err) {
          if (err) {
            console.error('[GoalModel] Erreur lors de la création de l\'étape:', err);
            reject(new Error('Erreur serveur lors de la création de l\'étape: ' + err.message));
          } else {
            const newMilestoneId = this.lastID;

            // Récupérer l'étape créée
            db.get('SELECT * FROM milestones WHERE id = ?', [newMilestoneId], (err, milestone) => {
              if (err) {
                console.error('[GoalModel] Erreur lors de la récupération de l\'étape créée:', err);
                resolve({ id: newMilestoneId, goal_id: goalId, name, target, achieved });
              } else {
                resolve(milestone);
              }
            });
          }
        });
      });
    });
  },

  /**
   * Mettre à jour une étape
   * @param {number} goalId - ID de l'objectif
   * @param {number} milestoneId - ID de l'étape
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Milestone mise à jour
   */
  updateMilestone: (goalId, milestoneId, updateData) => {
    return new Promise((resolve, reject) => {
      // Vérifier si l'étape existe et appartient à l'objectif
      db.get(
        'SELECT * FROM milestones WHERE id = ? AND goal_id = ?',
        [milestoneId, goalId],
        (err, milestone) => {
          if (err) {
            console.error(`[GoalModel] Erreur lors de la vérification de l'étape ${milestoneId}:`, err);
            return reject(new Error('Erreur serveur: ' + err.message));
          }

          if (!milestone) {
            return reject(new Error('Étape non trouvée'));
          }

          // Construire la requête de mise à jour
          const updates = [];
          const params = [];

          if (updateData.name !== undefined) {
            updates.push('name = ?');
            params.push(updateData.name);
          }

          if (updateData.target !== undefined) {
            updates.push('target = ?');
            params.push(updateData.target);
          }

          if (updateData.achieved !== undefined) {
            updates.push('achieved = ?');
            params.push(updateData.achieved ? 1 : 0);
          }

          // Ajouter les IDs pour la clause WHERE
          params.push(milestoneId);
          params.push(goalId);

          const query = `
            UPDATE milestones
            SET ${updates.join(', ')}
            WHERE id = ? AND goal_id = ?
          `;

          db.run(query, params, function(err) {
            if (err) {
              console.error(`[GoalModel] Erreur lors de la mise à jour de l'étape ${milestoneId}:`, err);
              reject(new Error('Erreur serveur: ' + err.message));
            } else {
              // Récupérer l'étape mise à jour
              db.get('SELECT * FROM milestones WHERE id = ?', [milestoneId], (err, updatedMilestone) => {
                if (err) {
                  console.error('[GoalModel] Erreur lors de la récupération de l\'étape mise à jour:', err);
                  resolve({ id: milestoneId, goal_id: goalId, ...milestone, ...updateData });
                } else {
                  resolve(updatedMilestone);
                }
              });
            }
          });
        }
      );
    });
  },

  /**
   * Supprimer une étape
   * @param {number} goalId - ID de l'objectif
   * @param {number} milestoneId - ID de l'étape
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteMilestone: (goalId, milestoneId) => {
    return new Promise((resolve, reject) => {
      // Vérifier si l'étape existe et appartient à l'objectif
      db.get(
        'SELECT * FROM milestones WHERE id = ? AND goal_id = ?',
        [milestoneId, goalId],
        (err, milestone) => {
          if (err) {
            console.error(`[GoalModel] Erreur lors de la vérification de l'étape ${milestoneId}:`, err);
            return reject(new Error('Erreur serveur: ' + err.message));
          }

          if (!milestone) {
            return reject(new Error('Étape non trouvée'));
          }

          // Supprimer l'étape
          db.run(
            'DELETE FROM milestones WHERE id = ? AND goal_id = ?',
            [milestoneId, goalId],
            function(err) {
              if (err) {
                console.error(`[GoalModel] Erreur lors de la suppression de l'étape ${milestoneId}:`, err);
                reject(new Error('Erreur serveur: ' + err.message));
              } else {
                resolve({ id: milestoneId, changes: this.changes });
              }
            }
          );
        }
      );
    });
  }
};

module.exports = goalModel;
