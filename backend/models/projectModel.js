// backend/models/projectModel.js

/**
 * Modèle pour la gestion des projets
 * Note: Ce modèle n'est pas encore utilisé par le contrôleur, mais il est prêt à l'emploi.
 */

// Cette fonction prendra la connexion à la base de données en paramètre
const createProjectModel = (db) => {
    return {
      /**
       * Récupérer tous les projets
       * @returns {Promise} - Promesse contenant les projets
       */
      getAllProjects: () => {
        return new Promise((resolve, reject) => {
          console.log('[ProjectModel] Récupération de tous les projets');
          
          const query = `
            SELECT p.*, l.name as lead_name 
            FROM projects p
            LEFT JOIN leads l ON p.lead_id = l.id
            ORDER BY p.start_date DESC
          `;
          
          db.all(query, [], (err, projects) => {
            if (err) {
              console.error('[ProjectModel] Erreur lors de la récupération des projets:', err);
              reject(err);
            } else {
              console.log(`[ProjectModel] ${projects.length} projets récupérés avec succès`);
              resolve(projects);
            }
          });
        });
      },
      
      /**
       * Récupérer un projet par son ID
       * @param {number} id - ID du projet à récupérer
       * @returns {Promise} - Promesse contenant le projet
       */
      getProjectById: (id) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Récupération du projet ID: ${id}`);
          
          const query = `
            SELECT p.*, l.name as lead_name 
            FROM projects p
            LEFT JOIN leads l ON p.lead_id = l.id
            WHERE p.id = ?
          `;
          
          db.get(query, [id], (err, project) => {
            if (err) {
              console.error(`[ProjectModel] Erreur lors de la récupération du projet ID ${id}:`, err);
              reject(err);
            } else {
              if (!project) {
                console.log(`[ProjectModel] Aucun projet trouvé avec l'ID ${id}`);
                resolve(null);
                return;
              }
              
              console.log(`[ProjectModel] Projet ID ${id} récupéré avec succès`);
              
              // Récupérer les tâches associées au projet
              db.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY id', [id], (taskErr, tasks) => {
                if (taskErr) {
                  console.error(`[ProjectModel] Erreur lors de la récupération des tâches du projet ID ${id}:`, taskErr);
                  project.tasks = [];
                } else {
                  project.tasks = tasks || [];
                  console.log(`[ProjectModel] ${tasks.length} tâches récupérées pour le projet ID ${id}`);
                  
                  // Calculer la progression basée sur les tâches complétées
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
      },
      
      /**
       * Créer un nouveau projet
       * @param {object} projectData - Données du projet à créer
       * @returns {Promise} - Promesse contenant le projet créé
       */
      createProject: (projectData) => {
        return new Promise((resolve, reject) => {
          console.log('[ProjectModel] Début de création de projet avec données:', JSON.stringify(projectData, null, 2));
          
          const { 
            name, 
            type, 
            description, 
            start_date, 
            end_date, 
            status, 
            amount, 
            lead_id 
          } = projectData;
          
          if (!name || !type || !status) {
            console.error('[ProjectModel] Données de projet invalides: nom, type et statut sont requis');
            return reject(new Error('Nom, type et statut sont requis'));
          }
          
          const query = `
            INSERT INTO projects (
              name, type, description, start_date, end_date, 
              status, amount, lead_id, created_at, updated_at, progress
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            now, 
            now,
            0 // progression initiale à 0
          ];
          
          console.log('[ProjectModel] Requête SQL:', query);
          console.log('[ProjectModel] Paramètres:', JSON.stringify(params, null, 2));
          
          try {
            db.run(query, params, function(err) {
              if (err) {
                console.error('[ProjectModel] Erreur lors de la création du projet:', err);
                reject(err);
              } else {
                const newProjectId = this.lastID;
                console.log(`[ProjectModel] Projet créé avec succès, ID: ${newProjectId}`);
                
                // Récupérer le projet créé
                const getQuery = `
                  SELECT p.*, l.name as lead_name 
                  FROM projects p 
                  LEFT JOIN leads l ON p.lead_id = l.id 
                  WHERE p.id = ?
                `;
                
                db.get(getQuery, [newProjectId], (getErr, project) => {
                  if (getErr) {
                    console.error(`[ProjectModel] Erreur lors de la récupération du nouveau projet ID ${newProjectId}:`, getErr);
                    resolve({ 
                      id: newProjectId, 
                      ...projectData,
                      progress: 0,
                      tasks: []
                    });
                  } else {
                    console.log(`[ProjectModel] Nouveau projet ID ${newProjectId} récupéré avec succès`);
                    project.tasks = [];
                    project.progress = 0;
                    resolve(project);
                  }
                });
              }
            });
          } catch (error) {
            console.error('[ProjectModel] Exception lors de l\'exécution de la requête:', error);
            reject(error);
          }
        });
      },
      
      /**
       * Mettre à jour un projet existant
       * @param {number} id - ID du projet à mettre à jour
       * @param {object} projectData - Nouvelles données du projet
       * @returns {Promise} - Promesse contenant le projet mis à jour
       */
      updateProject: (id, projectData) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Mise à jour du projet ID: ${id}`);
          console.log('[ProjectModel] Données de mise à jour:', JSON.stringify(projectData, null, 2));
          
          // Vérifier si le projet existe
          db.get('SELECT * FROM projects WHERE id = ?', [id], (err, project) => {
            if (err) {
              console.error(`[ProjectModel] Erreur lors de la vérification du projet ID ${id}:`, err);
              return reject(err);
            }
            
            if (!project) {
              console.error(`[ProjectModel] Projet non trouvé avec l'ID ${id}`);
              return reject(new Error('Projet non trouvé'));
            }
            
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
            
            if (projectData.progress !== undefined) {
              updates.push('progress = ?');
              params.push(projectData.progress);
            }
            
            // Ajouter la date de mise à jour
            updates.push('updated_at = ?');
            params.push(new Date().toISOString());
            
            // Si aucun champ à mettre à jour, ne rien faire
            if (updates.length === 0) {
              console.log('[ProjectModel] Aucun champ à mettre à jour');
              return resolve(project);
            }
            
            // Ajouter l'ID pour la clause WHERE
            params.push(id);
            
            const query = `
              UPDATE projects
              SET ${updates.join(', ')}
              WHERE id = ?
            `;
            
            console.log('[ProjectModel] Requête SQL:', query);
            console.log('[ProjectModel] Paramètres:', JSON.stringify(params, null, 2));
            
            db.run(query, params, function(updateErr) {
              if (updateErr) {
                console.error(`[ProjectModel] Erreur lors de la mise à jour du projet ID ${id}:`, updateErr);
                reject(updateErr);
              } else {
                console.log(`[ProjectModel] Projet ID ${id} mis à jour, ${this.changes} lignes affectées`);
                
                // Récupérer le projet mis à jour
                const getQuery = `
                  SELECT p.*, l.name as lead_name 
                  FROM projects p 
                  LEFT JOIN leads l ON p.lead_id = l.id 
                  WHERE p.id = ?
                `;
                
                db.get(getQuery, [id], (getErr, updatedProject) => {
                  if (getErr) {
                    console.error(`[ProjectModel] Erreur lors de la récupération du projet mis à jour ID ${id}:`, getErr);
                    resolve({ 
                      id, 
                      ...project, 
                      ...projectData 
                    });
                  } else {
                    console.log(`[ProjectModel] Projet mis à jour ID ${id} récupéré avec succès`);
                    
                    // Récupérer les tâches associées pour calculer la progression actuelle
                    db.all('SELECT * FROM tasks WHERE project_id = ?', [id], (taskErr, tasks) => {
                      if (taskErr) {
                        console.error(`[ProjectModel] Erreur lors de la récupération des tâches du projet ID ${id}:`, taskErr);
                        updatedProject.tasks = [];
                      } else {
                        updatedProject.tasks = tasks || [];
                        
                        // Recalculer la progression seulement si elle n'a pas été spécifiée dans projectData
                        if (projectData.progress === undefined && updatedProject.tasks.length > 0) {
                          const completedTasks = updatedProject.tasks.filter(task => task.completed).length;
                          updatedProject.progress = Math.round((completedTasks / updatedProject.tasks.length) * 100);
                          
                          // Mettre à jour la progression dans la base de données
                          db.run('UPDATE projects SET progress = ? WHERE id = ?', [updatedProject.progress, id], (progErr) => {
                            if (progErr) {
                              console.error(`[ProjectModel] Erreur lors de la mise à jour de la progression du projet ID ${id}:`, progErr);
                            }
                          });
                        }
                      }
                      
                      resolve(updatedProject);
                    });
                  }
                });
              }
            });
          });
        });
      },
      
      /**
       * Supprimer un projet
       * @param {number} id - ID du projet à supprimer
       * @returns {Promise} - Promesse indiquant le succès de l'opération
       */
      deleteProject: (id) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Suppression du projet ID: ${id}`);
          
          // Vérifier si le projet existe
          db.get('SELECT * FROM projects WHERE id = ?', [id], (err, project) => {
            if (err) {
              console.error(`[ProjectModel] Erreur lors de la vérification du projet ID ${id}:`, err);
              return reject(err);
            }
            
            if (!project) {
              console.error(`[ProjectModel] Projet non trouvé avec l'ID ${id}`);
              return reject(new Error('Projet non trouvé'));
            }
            
            // Supprimer les tâches associées
            db.run('DELETE FROM tasks WHERE project_id = ?', [id], (taskErr) => {
              if (taskErr) {
                console.error(`[ProjectModel] Erreur lors de la suppression des tâches du projet ID ${id}:`, taskErr);
                // Continuer malgré l'erreur
              }
              
              // Supprimer le projet
              db.run('DELETE FROM projects WHERE id = ?', [id], function(deleteErr) {
                if (deleteErr) {
                  console.error(`[ProjectModel] Erreur lors de la suppression du projet ID ${id}:`, deleteErr);
                  reject(deleteErr);
                } else {
                  console.log(`[ProjectModel] Projet ID ${id} supprimé, ${this.changes} lignes affectées`);
                  resolve({ id, changes: this.changes });
                }
              });
            });
          });
        });
      },
      
      /**
       * Ajouter une tâche à un projet
       * @param {number} projectId - ID du projet
       * @param {object} taskData - Données de la tâche
       * @returns {Promise} - Promesse contenant la tâche créée
       */
      addTask: (projectId, taskData) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Ajout de tâche au projet ID: ${projectId}`);
          console.log('[ProjectModel] Données de la tâche:', JSON.stringify(taskData, null, 2));
          
          const { title, description, deadline, completed } = taskData;
          
          if (!title) {
            console.error('[ProjectModel] Données de tâche invalides: titre requis');
            return reject(new Error('Titre de la tâche requis'));
          }
          
          // Vérifier si le projet existe
          db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
            if (err) {
              console.error(`[ProjectModel] Erreur lors de la vérification du projet ID ${projectId}:`, err);
              return reject(err);
            }
            
            if (!project) {
              console.error(`[ProjectModel] Projet non trouvé avec l'ID ${projectId}`);
              return reject(new Error('Projet non trouvé'));
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
                console.error('[ProjectModel] Erreur lors de la création de la table tasks:', tableErr);
                return reject(tableErr);
              }
              
              // Insérer la tâche
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
              ], function(insertErr) {
                if (insertErr) {
                  console.error('[ProjectModel] Erreur lors de la création de la tâche:', insertErr);
                  reject(insertErr);
                } else {
                  const newTaskId = this.lastID;
                  console.log(`[ProjectModel] Tâche créée avec succès, ID: ${newTaskId}`);
                  
                  // Récupérer la tâche créée
                  db.get('SELECT * FROM tasks WHERE id = ?', [newTaskId], (getErr, task) => {
                    if (getErr) {
                      console.error(`[ProjectModel] Erreur lors de la récupération de la tâche ID ${newTaskId}:`, getErr);
                      resolve({ 
                        id: newTaskId, 
                        project_id: projectId,
                        title,
                        description: description || null,
                        deadline: deadline || null,
                        completed: completed ? 1 : 0
                      });
                    } else {
                      console.log(`[ProjectModel] Nouvelle tâche ID ${newTaskId} récupérée avec succès`);
                      
                      // Mettre à jour la progression du projet
                      db.all('SELECT * FROM tasks WHERE project_id = ?', [projectId], (tasksErr, tasks) => {
                        if (tasksErr) {
                          console.error(`[ProjectModel] Erreur lors de la récupération des tâches du projet ID ${projectId}:`, tasksErr);
                          resolve(task);
                          return;
                        }
                        
                        const totalTasks = tasks.length;
                        const completedTasks = tasks.filter(t => t.completed).length;
                        const progress = Math.round((completedTasks / totalTasks) * 100);
                        
                        // Mettre à jour la progression du projet
                        db.run('UPDATE projects SET progress = ? WHERE id = ?', [progress, projectId], (updateErr) => {
                          if (updateErr) {
                            console.error(`[ProjectModel] Erreur lors de la mise à jour de la progression du projet ID ${projectId}:`, updateErr);
                          } else {
                            console.log(`[ProjectModel] Progression du projet mise à jour: ${progress}%`);
                          }
                          
                          resolve(task);
                        });
                      });
                    }
                  });
                }
              });
            });
          });
        });
      },
      
      /**
       * Mettre à jour une tâche
       * @param {number} projectId - ID du projet
       * @param {number} taskId - ID de la tâche
       * @param {object} taskData - Nouvelles données de la tâche
       * @returns {Promise} - Promesse contenant la tâche mise à jour
       */
      updateTask: (projectId, taskId, taskData) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Mise à jour de la tâche ID: ${taskId} du projet ID: ${projectId}`);
          console.log('[ProjectModel] Données de mise à jour:', JSON.stringify(taskData, null, 2));
          
          // Vérifier si la tâche existe et appartient au projet
          db.get(
            'SELECT * FROM tasks WHERE id = ? AND project_id = ?', 
            [taskId, projectId], 
            (err, task) => {
              if (err) {
                console.error(`[ProjectModel] Erreur lors de la vérification de la tâche ID ${taskId}:`, err);
                return reject(err);
              }
              
              if (!task) {
                console.error(`[ProjectModel] Tâche non trouvée: ID ${taskId}, projet ID ${projectId}`);
                return reject(new Error('Tâche non trouvée'));
              }
              
              // Construire la requête de mise à jour
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
              
              // Si aucun champ à mettre à jour, ne rien faire
              if (updates.length === 0) {
                console.log('[ProjectModel] Aucun champ à mettre à jour pour la tâche');
                resolve(task);
                return;
              }
              
              // Ajouter les IDs pour la clause WHERE
              params.push(taskId);
              params.push(projectId);
              
              const query = `
                UPDATE tasks
                SET ${updates.join(', ')}
                WHERE id = ? AND project_id = ?
              `;
              
              console.log('[ProjectModel] Requête SQL:', query);
              console.log('[ProjectModel] Paramètres:', JSON.stringify(params, null, 2));
              
              db.run(query, params, function(updateErr) {
                if (updateErr) {
                  console.error(`[ProjectModel] Erreur lors de la mise à jour de la tâche ID ${taskId}:`, updateErr);
                  reject(updateErr);
                } else {
                  console.log(`[ProjectModel] Tâche ID ${taskId} mise à jour, ${this.changes} lignes affectées`);
                  
                  // Récupérer la tâche mise à jour
                  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (getErr, updatedTask) => {
                    if (getErr) {
                      console.error(`[ProjectModel] Erreur lors de la récupération de la tâche mise à jour ID ${taskId}:`, getErr);
                      resolve({ 
                        id: taskId, 
                        project_id: projectId, 
                        ...task, 
                        ...taskData 
                      });
                    } else {
                      console.log(`[ProjectModel] Tâche mise à jour ID ${taskId} récupérée avec succès`);
                      
                      // Mettre à jour la progression du projet
                      db.all('SELECT * FROM tasks WHERE project_id = ?', [projectId], (tasksErr, tasks) => {
                        if (tasksErr) {
                          console.error(`[ProjectModel] Erreur lors de la récupération des tâches du projet ID ${projectId}:`, tasksErr);
                          resolve(updatedTask);
                          return;
                        }
                        
                        const totalTasks = tasks.length;
                        const completedTasks = tasks.filter(t => t.completed).length;
                        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                        
                        // Mettre à jour la progression du projet
                        db.run('UPDATE projects SET progress = ? WHERE id = ?', [progress, projectId], (updateErr) => {
                          if (updateErr) {
                            console.error(`[ProjectModel] Erreur lors de la mise à jour de la progression du projet ID ${projectId}:`, updateErr);
                          } else {
                            console.log(`[ProjectModel] Progression du projet mise à jour: ${progress}%`);
                          }
                          
                          resolve(updatedTask);
                        });
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
       * @returns {Promise} - Promesse indiquant le succès de l'opération
       */
      deleteTask: (projectId, taskId) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Suppression de la tâche ID: ${taskId} du projet ID: ${projectId}`);
          
          // Vérifier si la tâche existe et appartient au projet
          db.get(
            'SELECT * FROM tasks WHERE id = ? AND project_id = ?', 
            [taskId, projectId], 
            (err, task) => {
              if (err) {
                console.error(`[ProjectModel] Erreur lors de la vérification de la tâche ID ${taskId}:`, err);
                return reject(err);
              }
              
              if (!task) {
                console.error(`[ProjectModel] Tâche non trouvée: ID ${taskId}, projet ID ${projectId}`);
                return reject(new Error('Tâche non trouvée'));
              }
              
              // Supprimer la tâche
              db.run(
                'DELETE FROM tasks WHERE id = ? AND project_id = ?', 
                [taskId, projectId], 
                function(deleteErr) {
                  if (deleteErr) {
                    console.error(`[ProjectModel] Erreur lors de la suppression de la tâche ID ${taskId}:`, deleteErr);
                    reject(deleteErr);
                  } else {
                    console.log(`[ProjectModel] Tâche ID ${taskId} supprimée, ${this.changes} lignes affectées`);
                    
                    // Mettre à jour la progression du projet
                    db.all('SELECT * FROM tasks WHERE project_id = ?', [projectId], (tasksErr, tasks) => {
                      if (tasksErr) {
                        console.error(`[ProjectModel] Erreur lors de la récupération des tâches du projet ID ${projectId}:`, tasksErr);
                        resolve({ id: taskId, changes: this.changes });
                        return;
                      }
                      
                      const totalTasks = tasks.length;
                      const completedTasks = tasks.filter(t => t.completed).length;
                      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                      
                      // Mettre à jour la progression du projet
                      db.run('UPDATE projects SET progress = ? WHERE id = ?', [progress, projectId], (updateErr) => {
                        if (updateErr) {
                          console.error(`[ProjectModel] Erreur lors de la mise à jour de la progression du projet ID ${projectId}:`, updateErr);
                        } else {
                          console.log(`[ProjectModel] Progression du projet mise à jour: ${progress}%`);
                        }
                        
                        resolve({ id: taskId, changes: this.changes });
                      });
                    });
                  }
                }
              );
            }
          );
        });
      },
      
      /**
       * Récupérer les projets récents
       * @param {number} limit - Nombre de projets à récupérer
       * @returns {Promise} - Promesse contenant les projets récents
       */
      getRecentProjects: (limit = 5) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Récupération des ${limit} projets les plus récents`);
          
          const query = `
            SELECT p.*, l.name as lead_name 
            FROM projects p
            LEFT JOIN leads l ON p.lead_id = l.id
            ORDER BY p.created_at DESC
            LIMIT ?
          `;
          
          db.all(query, [limit], (err, projects) => {
            if (err) {
              console.error('[ProjectModel] Erreur lors de la récupération des projets récents:', err);
              reject(err);
            } else {
              console.log(`[ProjectModel] ${projects.length} projets récents récupérés avec succès`);
              resolve(projects);
            }
          });
        });
      },
      
      /**
       * Mettre à jour la progression d'un projet basée sur ses tâches
       * @param {number} projectId - ID du projet
       * @returns {Promise} - Promesse contenant la progression mise à jour
       */
      updateProjectProgress: (projectId) => {
        return new Promise((resolve, reject) => {
          console.log(`[ProjectModel] Calcul et mise à jour de la progression du projet ID: ${projectId}`);
          
          // Récupérer toutes les tâches du projet
          db.all('SELECT * FROM tasks WHERE project_id = ?', [projectId], (err, tasks) => {
            if (err) {
              console.error(`[ProjectModel] Erreur lors de la récupération des tâches du projet ID ${projectId}:`, err);
              return reject(err);
            }
            
            // Calculer la progression
            const totalTasks = tasks.length;
            const completedTasks = tasks.filter(task => task.completed).length;
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            
            console.log(`[ProjectModel] Progression calculée pour le projet ID ${projectId}: ${progress}%`);
            
            // Mettre à jour la progression du projet
            db.run('UPDATE projects SET progress = ? WHERE id = ?', [progress, projectId], function(updateErr) {
              if (updateErr) {
                console.error(`[ProjectModel] Erreur lors de la mise à jour de la progression du projet ID ${projectId}:`, updateErr);
                reject(updateErr);
              } else {
                console.log(`[ProjectModel] Progression du projet ID ${projectId} mise à jour: ${progress}%, ${this.changes} lignes affectées`);
                resolve({ progress, changes: this.changes });
              }
            });
          });
        });
      }
    };
  };
  
  // Exporter la fonction de création du modèle
  module.exports = createProjectModel;