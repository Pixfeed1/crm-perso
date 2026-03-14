// backend/models/projectModel.js
// Converti en PostgreSQL natif ($1, $2, etc.)

const PROJECT_COLUMNS = 'id, name, type, description, start_date, end_date, status, amount, lead_id, client_id, progress, created_at, updated_at';
const TASK_COLUMNS = 'id, project_id, title, description, deadline, completed, priority';

/**
 * Recuperer tous les projets
 */
const getAllProjects = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.id, p.name, p.type, p.description, p.start_date, p.end_date,
        p.status, p.amount, p.lead_id, p.client_id, p.progress, p.created_at, p.updated_at,
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
 * Recuperer un projet par son ID
 */
const getProjectById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.id, p.name, p.type, p.description, p.start_date, p.end_date,
        p.status, p.amount, p.lead_id, p.client_id, p.progress, p.created_at, p.updated_at,
        l.name as lead_name,
        c.name as client_name,
        COALESCE(c.name, l.name) as display_name
      FROM projects p
      LEFT JOIN leads l ON p.lead_id = l.id
      LEFT JOIN crm_clients c ON p.client_id = c.id
      WHERE p.id = $1
    `;

    db.get(query, [id], (err, project) => {
      if (err) {
        reject(err);
      } else if (!project) {
        resolve(null);
      } else {
        db.all(`SELECT ${TASK_COLUMNS} FROM tasks WHERE project_id = $1 ORDER BY id`, [id], (taskErr, tasks) => {
          project.tasks = taskErr ? [] : (tasks || []);

          if (project.tasks.length > 0) {
            const completedTasks = project.tasks.filter(task => task.completed).length;
            project.progress = Math.round((completedTasks / project.tasks.length) * 100);
          } else {
            project.progress = 0;
          }

          resolve(project);
        });
      }
    });
  });
};

/**
 * Creer un nouveau projet
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
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

    db.get(query, params, function(err, result) {
      if (err) {
        reject(err);
      } else {
        const newProjectId = result?.id || this.lastID;

        const getQuery = `
          SELECT
            p.id, p.name, p.type, p.description, p.start_date, p.end_date,
            p.status, p.amount, p.lead_id, p.client_id, p.progress, p.created_at, p.updated_at,
            l.name as lead_name,
            c.name as client_name,
            COALESCE(c.name, l.name) as display_name
          FROM projects p
          LEFT JOIN leads l ON p.lead_id = l.id
          LEFT JOIN crm_clients c ON p.client_id = c.id
          WHERE p.id = $1
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
 * Mettre a jour un projet (requete dynamique)
 */
const updateProject = (db, id, projectData) => {
  return new Promise((resolve, reject) => {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (projectData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(projectData.name);
    }
    if (projectData.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      params.push(projectData.type);
    }
    if (projectData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(projectData.description);
    }
    if (projectData.start_date !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      params.push(projectData.start_date);
    }
    if (projectData.end_date !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(projectData.end_date);
    }
    if (projectData.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(projectData.status);
    }
    if (projectData.amount !== undefined) {
      updates.push(`amount = $${paramIndex++}`);
      params.push(projectData.amount);
    }
    if (projectData.lead_id !== undefined) {
      updates.push(`lead_id = $${paramIndex++}`);
      params.push(projectData.lead_id);
    }
    if (projectData.client_id !== undefined) {
      updates.push(`client_id = $${paramIndex++}`);
      params.push(projectData.client_id);
    }
    if (projectData.progress !== undefined) {
      updates.push(`progress = $${paramIndex++}`);
      params.push(projectData.progress);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    params.push(id);

    const query = `
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id
    `;

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        getProjectById(db, id).then(resolve).catch(reject);
      }
    });
  });
};

/**
 * Supprimer un projet
 */
const deleteProject = (db, id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tasks WHERE project_id = $1', [id], () => {
      db.run('DELETE FROM projects WHERE id = $1', [id], function(err) {
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
 * Ajouter une tache a un projet
 */
const addTask = (db, projectId, taskData) => {
  return new Promise((resolve, reject) => {
    const { title, description, deadline, completed, priority } = taskData;

    if (!title) {
      return reject(new Error('Titre de la tache requis'));
    }

    const query = `
      INSERT INTO tasks (project_id, title, description, deadline, completed, priority)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    db.get(query, [
      projectId,
      title,
      description || null,
      deadline || null,
      completed ? true : false,
      priority || 'medium'
    ], function(err, result) {
      if (err) {
        reject(err);
      } else {
        const newTaskId = result?.id || this.lastID;

        db.get(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`, [newTaskId], (getErr, task) => {
          if (getErr) {
            resolve({
              id: newTaskId,
              project_id: projectId,
              ...taskData
            });
          } else {
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
 * Mettre a jour une tache (requete dynamique)
 */
const updateTask = (db, projectId, taskId, taskData) => {
  return new Promise((resolve, reject) => {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (taskData.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(taskData.title);
    }
    if (taskData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(taskData.description);
    }
    if (taskData.deadline !== undefined) {
      updates.push(`deadline = $${paramIndex++}`);
      params.push(taskData.deadline);
    }
    if (taskData.completed !== undefined) {
      updates.push(`completed = $${paramIndex++}`);
      params.push(taskData.completed ? true : false);
    }

    if (updates.length === 0) {
      return db.get(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1 AND project_id = $2`, [taskId, projectId], (err, task) => {
        if (err) reject(err);
        else if (!task) reject(new Error('Tache non trouvee'));
        else resolve(task);
      });
    }

    params.push(taskId);
    params.push(projectId);

    const query = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND project_id = $${paramIndex}
      RETURNING id
    `;

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Tache non trouvee'));
      } else {
        db.get(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`, [taskId], (getErr, task) => {
          if (getErr) {
            reject(getErr);
          } else {
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
 * Supprimer une tache
 */
const deleteTask = (db, projectId, taskId) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tasks WHERE id = $1 AND project_id = $2', [taskId, projectId], function(err) {
      if (err) {
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Tache non trouvee'));
      } else {
        updateProjectProgress(db, projectId)
          .then(() => resolve({ id: taskId, changes: this.changes }))
          .catch(() => resolve({ id: taskId, changes: this.changes }));
      }
    });
  });
};

/**
 * Mettre a jour la progression d'un projet basee sur ses taches
 */
const updateProjectProgress = (db, projectId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT ${TASK_COLUMNS} FROM tasks WHERE project_id = $1`, [projectId], (err, tasks) => {
      if (err) {
        return reject(err);
      }

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => task.completed).length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      db.run('UPDATE projects SET progress = $1 WHERE id = $2', [progress, projectId], function(updateErr) {
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
