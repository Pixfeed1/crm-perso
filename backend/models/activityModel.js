// backend/models/activityModel.js

/**
 * Modèle pour les activités
 */
const db = require('../config/pgConfig');
const goalTracker = require('../utils/goalTracker');

const activityModel = {
  /**
   * Récupérer toutes les activités
   * @returns {Promise<Array>} Liste des activités
   */
  getAllActivities: () => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          a.*,
          p.name as project_name
        FROM
          activities a
        LEFT JOIN
          projects p ON a.project_id = p.id
        ORDER BY
          a.date DESC
      `;

      db.all(query, [], (error, activities) => {
        if (error) {
          console.error('Erreur dans getAllActivities:', error);
          reject(new Error('Erreur serveur lors de la récupération des activités: ' + error.message));
        } else {
          resolve(activities);
        }
      });
    });
  },
  
  /**
   * Récupérer une activité par son ID
   * @param {number} id - ID de l'activité
   * @returns {Promise<Object>} Activité
   */
  getActivityById: (id) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          a.*,
          p.name as project_name
        FROM
          activities a
        LEFT JOIN
          projects p ON a.project_id = p.id
        WHERE
          a.id = ?
      `;

      db.get(query, [id], (error, activity) => {
        if (error) {
          console.error('Erreur dans getActivityById:', error);
          reject(new Error('Erreur serveur lors de la récupération de l\'activité: ' + error.message));
        } else {
          resolve(activity || null);
        }
      });
    });
  },
  
  /**
   * Créer une nouvelle activité
   * @param {Object} activityData - Données de l'activité
   * @returns {Promise<number>} ID de la nouvelle activité
   */
  createActivity: (activityData) => {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();

      const query = `
        INSERT INTO activities (
          type, description, planned_time, actual_time, date,
          priority, status, project_id, lead_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        activityData.type,
        activityData.description,
        activityData.planned_time || 0,
        activityData.actual_time || 0,
        activityData.date,
        activityData.priority || 'medium',
        activityData.status || 'planned',
        activityData.project_id || null,
        activityData.lead_id || null,
        now,
        now
      ];

      db.run(query, params, function(error) {
        if (error) {
          console.error('Erreur dans createActivity:', error);
          reject(new Error('Erreur serveur lors de la création de l\'activité: ' + error.message));
        } else {
          const newActivityId = this.lastID;

          // Récupérer l'activité créée pour mettre à jour les objectifs
          db.get('SELECT * FROM activities WHERE id = ?', [newActivityId], (err, activity) => {
            if (err) {
              console.error('Erreur lors de la récupération de l\'activité créée:', err);
              resolve(newActivityId);
            } else if (activity) {
              // Mettre à jour les objectifs de type productivity/time
              goalTracker.updateGoalsForActivity(activity)
                .then(() => {
                  console.log(`[ActivityModel] Objectifs mis à jour pour l'activité ${activity.id}`);
                })
                .catch(goalErr => {
                  console.error('[ActivityModel] Erreur lors de la mise à jour des objectifs:', goalErr);
                });

              resolve(newActivityId);
            } else {
              resolve(newActivityId);
            }
          });
        }
      });
    });
  },
  
  /**
   * Mettre à jour une activité
   * @param {number} id - ID de l'activité à mettre à jour
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Résultat de la mise à jour
   */
  updateActivity: (id, updateData) => {
    return new Promise((resolve, reject) => {
      // Construire la requête dynamiquement
      const columns = [];
      const values = [];

      // Ajouter chaque champ à mettre à jour
      if (updateData.type !== undefined) {
        columns.push('type = ?');
        values.push(updateData.type);
      }

      if (updateData.description !== undefined) {
        columns.push('description = ?');
        values.push(updateData.description);
      }

      if (updateData.planned_time !== undefined) {
        columns.push('planned_time = ?');
        values.push(updateData.planned_time);
      }

      if (updateData.actual_time !== undefined) {
        columns.push('actual_time = ?');
        values.push(updateData.actual_time);
      }

      if (updateData.date !== undefined) {
        columns.push('date = ?');
        values.push(updateData.date);
      }

      if (updateData.priority !== undefined) {
        columns.push('priority = ?');
        values.push(updateData.priority);
      }

      if (updateData.status !== undefined) {
        columns.push('status = ?');
        values.push(updateData.status);
      }

      if (updateData.project_id !== undefined) {
        columns.push('project_id = ?');
        values.push(updateData.project_id);
      }

      if (updateData.lead_id !== undefined) {
        columns.push('lead_id = ?');
        values.push(updateData.lead_id);
      }

      // Ajouter la date de mise à jour
      columns.push('updated_at = ?');
      values.push(new Date().toISOString());

      // Ajouter l'ID à la fin des valeurs
      values.push(id);

      const query = `
        UPDATE activities
        SET ${columns.join(', ')}
        WHERE id = ?
      `;

      db.run(query, values, function(error) {
        if (error) {
          console.error('Erreur dans updateActivity:', error);
          reject(new Error('Erreur serveur lors de la mise à jour de l\'activité: ' + error.message));
        } else {
          // Récupérer l'activité mise à jour pour mettre à jour les objectifs
          db.get('SELECT * FROM activities WHERE id = ?', [id], (err, activity) => {
            if (err) {
              console.error('Erreur lors de la récupération de l\'activité mise à jour:', err);
              resolve({
                changes: this.changes,
                id: id
              });
            } else if (activity) {
              // Mettre à jour les objectifs de type productivity/time
              goalTracker.updateGoalsForActivity(activity)
                .then(() => {
                  console.log(`[ActivityModel] Objectifs mis à jour pour l'activité ${activity.id}`);
                })
                .catch(goalErr => {
                  console.error('[ActivityModel] Erreur lors de la mise à jour des objectifs:', goalErr);
                });

              resolve({
                changes: this.changes,
                id: id
              });
            } else {
              resolve({
                changes: this.changes,
                id: id
              });
            }
          });
        }
      });
    });
  },
  
  /**
   * Marquer une activité comme terminée
   * @param {number} id - ID de l'activité
   * @param {number} actualTime - Temps réel passé
   * @returns {Promise<Object>} Résultat de la mise à jour
   */
  completeActivity: (id, actualTime) => {
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

      db.run(query, [actualTime, now, id], function(error) {
        if (error) {
          console.error('Erreur dans completeActivity:', error);
          reject(new Error('Erreur serveur lors de la complétion de l\'activité: ' + error.message));
        } else {
          // Récupérer l'activité complétée pour mettre à jour les objectifs
          db.get('SELECT * FROM activities WHERE id = ?', [id], (err, activity) => {
            if (err) {
              console.error('Erreur lors de la récupération de l\'activité complétée:', err);
              resolve({
                changes: this.changes,
                id: id
              });
            } else if (activity) {
              // Mettre à jour les objectifs de type productivity/time
              goalTracker.updateGoalsForActivity(activity)
                .then(() => {
                  console.log(`[ActivityModel] Objectifs mis à jour après complétion de l'activité ${activity.id}`);
                })
                .catch(goalErr => {
                  console.error('[ActivityModel] Erreur lors de la mise à jour des objectifs:', goalErr);
                });

              resolve({
                changes: this.changes,
                id: id
              });
            } else {
              resolve({
                changes: this.changes,
                id: id
              });
            }
          });
        }
      });
    });
  },
  
  /**
   * Supprimer une activité
   * @param {number} id - ID de l'activité à supprimer
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteActivity: (id) => {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM activities WHERE id = ?';

      db.run(query, [id], function(error) {
        if (error) {
          console.error('Erreur dans deleteActivity:', error);
          reject(new Error('Erreur serveur lors de la suppression de l\'activité: ' + error.message));
        } else {
          resolve({
            changes: this.changes,
            id: id
          });
        }
      });
    });
  },
  
  /**
   * Récupérer les activités récentes
   * @param {number} limit - Nombre d'activités à récupérer
   * @returns {Promise<Array>} Liste des activités récentes
   */
  getRecentActivities: (limit = 5) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          a.*,
          p.name as project_name
        FROM
          activities a
        LEFT JOIN
          projects p ON a.project_id = p.id
        ORDER BY
          a.date DESC
        LIMIT ?
      `;

      db.all(query, [limit], (error, activities) => {
        if (error) {
          console.error('Erreur dans getRecentActivities:', error);
          reject(new Error('Erreur serveur lors de la récupération des activités récentes: ' + error.message));
        } else {
          resolve(activities);
        }
      });
    });
  }
};

module.exports = activityModel;