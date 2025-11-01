// backend/models/projectModel.js

/**
 * Modèle pour la gestion des projets
 * Pattern standardisé: chaque fonction prend db comme premier paramètre
 */

/**
 * Récupérer tous les projets
 * @param {object} db - Instance de la base de données
 * @returns {Promise} - Promesse contenant les projets
 */
const getAllProjects = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.*,
        l.name as lead_name,
        c.name as client_name,
        COALESCE(c.name, l.name) as display_name
      FROM projects p
      LEFT JOIN leads l ON p.lead_id = l.id
      LEFT JOIN crm_clients c ON p.client_id = c.id
      ORDER BY p.start_date DESC
    `;

    db.all(query, [], (err, projects) => {
      if (err) reject(err);
      else resolve(projects || []);
    });
  });
};

/**
 * Récupérer un projet par son ID
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID du projet
 * @returns {Promise} - Promesse contenant le projet avec ses tâches
 */
const getProjectById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.*,
        l.name as lead_name,
        c.name as client_name,
        COALESCE(c.name, l.name) as display_name
      FROM projects p
      LEFT JOIN leads l ON p.lead_id = l.id
      LEFT JOIN crm_clients c ON p.client_id = c.id
      WHERE p.id = ?
    `;

    db.get(query, [id], (err, project) => {
      if (err) {
        reject(err);
      } else if (!project) {
        resolve(null);
      } else {
        // Récupérer les tâches associées
        db.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY id', [id], (taskErr, tasks) => {
          if (taskErr) {
            project.tasks = [];
          } else {
            project.tasks = tasks || [];

            // Calculer la progression
            if (project.tasks.length > 0) {
              const completedTasks = project.tasks.filter(task => task.completed).length;
              project.progress = Math.round((completedTasks / project.tasks.length) * 100);
            } else {
              project.progress = 0;
            }
          }
          resolve(project);
        });
      }
    });
  });
};

/**
 * Créer un nouveau projet
 * @param {object} db - Instance de la base de données
 * @param {object} projectData - Données du projet
 * @returns {Promise} - Promesse contenant le projet créé
 */
const createProject = (db, projectData) => {
  return new Promise((resolve, reject) => {
    const {
      name,
      type,
      description,
      start_date,
      end_date,
      status,
      amount,
      lead_id,
      client_id
    } = projectData;

    if (!name || !type || !status) {
      return reject(new Error('Nom, type et statut sont requis'));
    }

    const query = `
      INSERT INTO projects (
        name, type, description, start_date, end_date,
        status, amount, lead_id, client_id, created_at, updated_at, progress
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();
    const params = [
      name,
      type,
      description || null,
      start_date,
      end_date,
      status,
      amount || 0,
      lead_id || null,
      client_id || null,
      now,
      now,
      0
    ];

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        const newProjectId = this.lastID;

        // Récupérer le projet créé
        const getQuery = `
          SELECT
            p.*,
            l.name as lead_name,
            c.name as client_name,
            COALESCE(c.name, l.name) as display_name
          FROM projects p
          LEFT JOIN leads l ON p.lead_id = l.id
          LEFT JOIN crm_clients c ON p.client_id = c.id
          WHERE p.id = ?
        `;

        db.get(getQuery, [newProjectId], (getErr, project) => {
          if (getErr) {
            resolve({
              id: newProjectId,
              ...projectData,
              progress: 0,
              tasks: []
            });
          } else {
            project.tasks = [];
            project.progress = 0;
            resolve(project);
          }
        });
      }
    });
  });
};

/**
 * Mettre à jour un projet
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID du projet
 * @param {object} projectData - Nouvelles données
 * @returns {Promise} - Promesse contenant le projet mis à jour
 */
const updateProject = (db, id, projectData) => {
  return new Promise((resolve, reject) => {
    // Construire la requête de mise à jour
    const updates = [];
    const params = [];

    if (projectData.name !== undefined) {
      updates.push('name = ?');
      params.push(projectData.name);
    }

    if (projectData.type !== undefined) {
      updates.push('type = ?');
      params.push(projectData.type);
    }

    if (projectData.description !== undefined) {
      updates.push('description = ?');
      params.push(projectData.description);
    }

    if (projectData.start_date !== undefined) {
      updates.push('start_date = ?');
      params.push(projectData.start_date);
    }

    if (projectData.end_date !== undefined) {
      updates.push('end_date = ?');
      params.push(projectData.end_date);
    }

    if (projectData.status !== undefined) {
      updates.push('status = ?');
      params.push(projectData.status);
    }

    if (projectData.amount !== undefined) {
      updates.push('amount = ?');
      params.push(projectData.amount);
    }

    if (projectData.lead_id !== undefined) {
      updates.push('lead_id = ?');
      params.push(projectData.lead_id);
    }

    if (projectData.client_id !== undefined) {
      updates.push('client_id = ?');
      params.push(projectData.client_id);
    }

    if (projectData.progress !== undefined) {
      updates.push('progress = ?');
      params.push(projectData.progress);
    }

    // Ajouter la date de mise à jour
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    // Ajouter l'ID
    params.push(id);

    const query = `
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = ?
    `;

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        // Récupérer le projet mis à jour avec ses tâches
        getProjectById(db, id).then(resolve).catch(reject);
      }
    });
  });
};

/**
 * Supprimer un projet
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID du projet
 * @returns {Promise} - Promesse de succès
 */
const deleteProject = (db, id) => {
  return new Promise((resolve, reject) => {
    // Supprimer les tâches associées
    db.run('DELETE FROM tasks WHERE project_id = ?', [id], (taskErr) => {
      // Continuer même en cas d'erreur sur les tâches

      // Supprimer le projet
      db.run('DELETE FROM projects WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  });
};

/**
 * Ajouter une tâche à un projet
 * @param {object} db - Instance de la base de données
 * @param {number} projectId - ID du projet
 * @param {object} taskData - Données de la tâche
 * @returns {Promise} - Promesse contenant la tâche créée
 */
const addTask = (db, projectId, taskData) => {
  return new Promise((resolve, reject) => {
    const { title, description, deadline, completed } = taskData;

    if (!title) {
      return reject(new Error('Titre de la tâche requis'));
    }

    // Créer la table tasks si elle n'existe pas
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        deadline DATE,
        completed BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      )
    `, (tableErr) => {
      if (tableErr) {
        return reject(tableErr);
      }

      const query = `
        INSERT INTO tasks (project_id, title, description, deadline, completed)
        VALUES (?, ?, ?, ?, ?)
      `;

      db.run(query, [
        projectId,
        title,
        description || null,
        deadline || null,
        completed ? 1 : 0
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          const newTaskId = this.lastID;

          // Récupérer la tâche créée
          db.get('SELECT * FROM tasks WHERE id = ?', [newTaskId], (getErr, task) => {
            if (getErr) {
              resolve({
                id: newTaskId,
                project_id: projectId,
                ...taskData
              });
            } else {
              // Mettre à jour la progression du projet
              updateProjectProgress(db, projectId)
                .then(() => resolve(task))
                .catch(() => resolve(task)); // Résoudre même en cas d'erreur de progression
            }
          });
        }
      });
    });
  });
};

/**
 * Mettre à jour une tâche
 * @param {object} db - Instance de la base de données
 * @param {number} projectId - ID du projet
 * @param {number} taskId - ID de la tâche
 * @param {object} taskData - Nouvelles données
 * @returns {Promise} - Promesse contenant la tâche mise à jour
 */
const updateTask = (db, projectId, taskId, taskData) => {
  return new Promise((resolve, reject) => {
    // Construire la requête
    const updates = [];
    const params = [];

    if (taskData.title !== undefined) {
      updates.push('title = ?');
      params.push(taskData.title);
    }

    if (taskData.description !== undefined) {
      updates.push('description = ?');
      params.push(taskData.description);
    }

    if (taskData.deadline !== undefined) {
      updates.push('deadline = ?');
      params.push(taskData.deadline);
    }

    if (taskData.completed !== undefined) {
      updates.push('completed = ?');
      params.push(taskData.completed ? 1 : 0);
    }

    if (updates.length === 0) {
      // Rien à mettre à jour
      return db.get('SELECT * FROM tasks WHERE id = ? AND project_id = ?', [taskId, projectId], (err, task) => {
        if (err) reject(err);
        else if (!task) reject(new Error('Tâche non trouvée'));
        else resolve(task);
      });
    }

    params.push(taskId);
    params.push(projectId);

    const query = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = ? AND project_id = ?
    `;

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Tâche non trouvée'));
      } else {
        // Récupérer la tâche mise à jour
        db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (getErr, task) => {
          if (getErr) {
            reject(getErr);
          } else {
            // Mettre à jour la progression du projet
            updateProjectProgress(db, projectId)
              .then(() => resolve(task))
              .catch(() => resolve(task));
          }
        });
      }
    });
  });
};

/**
 * Supprimer une tâche
 * @param {object} db - Instance de la base de données
 * @param {number} projectId - ID du projet
 * @param {number} taskId - ID de la tâche
 * @returns {Promise} - Promesse de succès
 */
const deleteTask = (db, projectId, taskId) => {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM tasks WHERE id = ? AND project_id = ?',
      [taskId, projectId],
      function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error('Tâche non trouvée'));
        } else {
          // Mettre à jour la progression du projet
          updateProjectProgress(db, projectId)
            .then(() => resolve({ id: taskId, changes: this.changes }))
            .catch(() => resolve({ id: taskId, changes: this.changes }));
        }
      }
    );
  });
};

/**
 * Mettre à jour la progression d'un projet basée sur ses tâches
 * @param {object} db - Instance de la base de données
 * @param {number} projectId - ID du projet
 * @returns {Promise} - Promesse contenant la progression
 */
const updateProjectProgress = (db, projectId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tasks WHERE project_id = ?', [projectId], (err, tasks) => {
      if (err) {
        return reject(err);
      }

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => task.completed).length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      db.run('UPDATE projects SET progress = ? WHERE id = ?', [progress, projectId], function(updateErr) {
        if (updateErr) {
          reject(updateErr);
        } else {
          resolve({ progress, changes: this.changes });
        }
      });
    });
  });
};

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addTask,
  updateTask,
  deleteTask,
  updateProjectProgress
};
