// backend/models/taskModel.js

/**
 * Modèle pour la gestion des tâches liées aux projets
 * (Extrait de projectModel.js pour meilleure séparation des responsabilités)
 */
const db = require('../config/pgConfig');

const taskModel = {
  /**
   * Récupérer toutes les tâches d'un projet
   * @param {number} projectId - ID du projet
   * @returns {Promise<Array>} Liste des tâches
   */
  getTasksByProject: (projectId) => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY id', [projectId], (err, tasks) => {
        if (err) {
          console.error(`[TaskModel] Erreur lors de la récupération des tâches du projet ${projectId}:`, err);
          reject(new Error('Erreur serveur lors de la récupération des tâches: ' + err.message));
        } else {
          resolve(tasks || []);
        }
      });
    });
  },

  /**
   * Récupérer une tâche par son ID
   * @param {number} id - ID de la tâche
   * @returns {Promise<Object>} Tâche
   */
  getTaskById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, task) => {
        if (err) {
          console.error(`[TaskModel] Erreur lors de la récupération de la tâche ${id}:`, err);
          reject(new Error('Erreur serveur lors de la récupération de la tâche: ' + err.message));
        } else {
          resolve(task || null);
        }
      });
    });
  },

  /**
   * Créer une nouvelle tâche
   * @param {number} projectId - ID du projet
   * @param {Object} taskData - Données de la tâche
   * @returns {Promise<Object>} Tâche créée
   */
  createTask: (projectId, taskData) => {
    return new Promise((resolve, reject) => {
      const { title, description, deadline, completed } = taskData;

      if (!title) {
        return reject(new Error('Titre de la tâche requis'));
      }

      // Vérifier si le projet existe
      db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
        if (err) {
          console.error(`[TaskModel] Erreur lors de la vérification du projet ${projectId}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!project) {
          return reject(new Error('Projet non trouvé'));
        }

        const query = `
          INSERT INTO tasks (project_id, title, description, deadline, completed, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        const now = new Date().toISOString();

        db.run(query, [
          projectId,
          title,
          description || null,
          deadline || null,
          completed ? 1 : 0,
          now
        ], function(err) {
          if (err) {
            console.error('[TaskModel] Erreur lors de la création de la tâche:', err);
            reject(new Error('Erreur serveur lors de la création de la tâche: ' + err.message));
          } else {
            const newTaskId = this.lastID;

            // Récupérer la tâche créée
            db.get('SELECT * FROM tasks WHERE id = ?', [newTaskId], (err, task) => {
              if (err) {
                console.error('[TaskModel] Erreur lors de la récupération de la tâche créée:', err);
                resolve({ id: newTaskId, project_id: projectId, ...taskData });
              } else {
                // Mettre à jour la progression du projet
                taskModel.updateProjectProgress(projectId)
                  .then(() => resolve(task))
                  .catch(err => {
                    console.error('[TaskModel] Erreur lors de la mise à jour de la progression:', err);
                    // Retourner quand même la tâche
                    resolve(task);
                  });
              }
            });
          }
        });
      });
    });
  },

  /**
   * Mettre à jour une tâche
   * @param {number} projectId - ID du projet
   * @param {number} taskId - ID de la tâche
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Tâche mise à jour
   */
  updateTask: (projectId, taskId, updateData) => {
    return new Promise((resolve, reject) => {
      // Vérifier si la tâche existe et appartient au projet
      db.get(
        'SELECT * FROM tasks WHERE id = ? AND project_id = ?',
        [taskId, projectId],
        (err, task) => {
          if (err) {
            console.error(`[TaskModel] Erreur lors de la vérification de la tâche ${taskId}:`, err);
            return reject(new Error('Erreur serveur: ' + err.message));
          }

          if (!task) {
            return reject(new Error('Tâche non trouvée'));
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

          if (updateData.deadline !== undefined) {
            updates.push('deadline = ?');
            params.push(updateData.deadline);
          }

          if (updateData.completed !== undefined) {
            updates.push('completed = ?');
            params.push(updateData.completed ? 1 : 0);
          }

          if (updates.length === 0) {
            return resolve(task);
          }

          // Ajouter les IDs pour la clause WHERE
          params.push(taskId);
          params.push(projectId);

          const query = `
            UPDATE tasks
            SET ${updates.join(', ')}
            WHERE id = ? AND project_id = ?
          `;

          db.run(query, params, function(err) {
            if (err) {
              console.error(`[TaskModel] Erreur lors de la mise à jour de la tâche ${taskId}:`, err);
              reject(new Error('Erreur serveur: ' + err.message));
            } else {
              // Récupérer la tâche mise à jour
              db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, updatedTask) => {
                if (err) {
                  console.error('[TaskModel] Erreur lors de la récupération de la tâche mise à jour:', err);
                  resolve({ id: taskId, project_id: projectId, ...task, ...updateData });
                } else {
                  // Mettre à jour la progression du projet
                  taskModel.updateProjectProgress(projectId)
                    .then(() => resolve(updatedTask))
                    .catch(err => {
                      console.error('[TaskModel] Erreur lors de la mise à jour de la progression:', err);
                      // Retourner quand même la tâche
                      resolve(updatedTask);
                    });
                }
              });
            }
          });
        }
      );
    });
  },

  /**
   * Supprimer une tâche
   * @param {number} projectId - ID du projet
   * @param {number} taskId - ID de la tâche
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteTask: (projectId, taskId) => {
    return new Promise((resolve, reject) => {
      // Vérifier si la tâche existe et appartient au projet
      db.get(
        'SELECT * FROM tasks WHERE id = ? AND project_id = ?',
        [taskId, projectId],
        (err, task) => {
          if (err) {
            console.error(`[TaskModel] Erreur lors de la vérification de la tâche ${taskId}:`, err);
            return reject(new Error('Erreur serveur: ' + err.message));
          }

          if (!task) {
            return reject(new Error('Tâche non trouvée'));
          }

          // Supprimer la tâche
          db.run(
            'DELETE FROM tasks WHERE id = ? AND project_id = ?',
            [taskId, projectId],
            function(err) {
              if (err) {
                console.error(`[TaskModel] Erreur lors de la suppression de la tâche ${taskId}:`, err);
                reject(new Error('Erreur serveur: ' + err.message));
              } else {
                // Mettre à jour la progression du projet
                taskModel.updateProjectProgress(projectId)
                  .then(() => resolve({ id: taskId, changes: this.changes }))
                  .catch(err => {
                    console.error('[TaskModel] Erreur lors de la mise à jour de la progression:', err);
                    // Retourner quand même le résultat
                    resolve({ id: taskId, changes: this.changes });
                  });
              }
            }
          );
        }
      );
    });
  },

  /**
   * Marquer une tâche comme complétée
   * @param {number} projectId - ID du projet
   * @param {number} taskId - ID de la tâche
   * @param {boolean} completed - Statut de complétion
   * @returns {Promise<Object>} Tâche mise à jour
   */
  toggleTaskCompletion: (projectId, taskId, completed) => {
    return taskModel.updateTask(projectId, taskId, { completed });
  },

  /**
   * Récupérer les tâches en retard
   * @returns {Promise<Array>} Liste des tâches en retard
   */
  getOverdueTasks: () => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT t.*, p.name as project_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.completed = 0
          AND t.deadline < date('now')
        ORDER BY t.deadline ASC
      `;

      db.all(query, [], (err, tasks) => {
        if (err) {
          console.error('[TaskModel] Erreur lors de la récupération des tâches en retard:', err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          resolve(tasks);
        }
      });
    });
  },

  /**
   * Récupérer les tâches à venir (prochains X jours)
   * @param {number} days - Nombre de jours
   * @returns {Promise<Array>} Liste des tâches à venir
   */
  getUpcomingTasks: (days = 7) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT t.*, p.name as project_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.completed = 0
          AND t.deadline IS NOT NULL
          AND t.deadline >= date('now')
          AND t.deadline <= date('now', '+${days} days')
        ORDER BY t.deadline ASC
      `;

      db.all(query, [], (err, tasks) => {
        if (err) {
          console.error('[TaskModel] Erreur lors de la récupération des tâches à venir:', err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          resolve(tasks);
        }
      });
    });
  },

  /**
   * Mettre à jour la progression d'un projet basée sur ses tâches
   * @param {number} projectId - ID du projet
   * @returns {Promise<Object>} Résultat de la mise à jour
   */
  updateProjectProgress: (projectId) => {
    return new Promise((resolve, reject) => {
      // Récupérer toutes les tâches du projet
      db.all('SELECT * FROM tasks WHERE project_id = ?', [projectId], (err, tasks) => {
        if (err) {
          console.error(`[TaskModel] Erreur lors de la récupération des tâches du projet ${projectId}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        // Calculer la progression
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(task => task.completed).length;
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        console.log(`[TaskModel] Progression calculée pour le projet ${projectId}: ${progress}% (${completedTasks}/${totalTasks} tâches)`);

        // Mettre à jour la progression du projet
        db.run(
          'UPDATE projects SET progress = ?, updated_at = ? WHERE id = ?',
          [progress, new Date().toISOString(), projectId],
          function(err) {
            if (err) {
              console.error(`[TaskModel] Erreur lors de la mise à jour de la progression du projet ${projectId}:`, err);
              reject(new Error('Erreur serveur: ' + err.message));
            } else {
              console.log(`[TaskModel] Progression du projet ${projectId} mise à jour: ${progress}%`);
              resolve({ projectId, progress, changes: this.changes });
            }
          }
        );
      });
    });
  },

  /**
   * Récupérer toutes les tâches (tous projets)
   * @returns {Promise<Array>} Liste de toutes les tâches
   */
  getAllTasks: () => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT t.*, p.name as project_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        ORDER BY t.created_at DESC
      `;

      db.all(query, [], (err, tasks) => {
        if (err) {
          console.error('[TaskModel] Erreur lors de la récupération de toutes les tâches:', err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          resolve(tasks);
        }
      });
    });
  }
};

module.exports = taskModel;
