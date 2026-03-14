// backend/controllers/activityController.js
const { handleError } = require('../utils/errorHandler');

/**
 * Contrôleur pour gérer les routes liées aux activités
 */
const activityController = {
  /**
   * Fonction utilitaire pour s'assurer que toutes les tables nécessaires existent
   * @param {object} db - Instance de la base de données
   * @returns {Promise} - Promesse résolue lorsque toutes les tables sont créées
   */
  ensureTablesExist: function(db) {
    return new Promise((resolve, reject) => {
      console.log('[ActivityController] Vérification et création des tables si nécessaire');
      
      // Vérifier et créer la table leads
      db.get("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'leads')", [], (err, result) => {
        if (err) {
          console.error('[ActivityController] Erreur lors de la vérification de la table leads:', err);
          return reject(err);
        }
        
        const leadsExist = result && result.exists;
        
        if (!leadsExist) {
          console.log('[ActivityController] Table leads non trouvée, création...');
          db.run(`
            CREATE TABLE IF NOT EXISTS leads (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL,
              email TEXT,
              phone TEXT,
              company TEXT,
              status TEXT DEFAULT 'new',
              source TEXT,
              created_at TEXT,
              updated_at TEXT
            )
          `, [], (createLeadsErr) => {
            if (createLeadsErr) {
              console.error('[ActivityController] Erreur lors de la création de la table leads:', createLeadsErr);
              return reject(createLeadsErr);
            }
            
            console.log('[ActivityController] Table leads créée avec succès');
            proceedWithProjects();
          });
        } else {
          proceedWithProjects();
        }
      });
      
      // Vérifier et créer la table projects
      function proceedWithProjects() {
        db.get("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'projects')", [], (err, result) => {
          if (err) {
            console.error('[ActivityController] Erreur lors de la vérification de la table projects:', err);
            return reject(err);
          }
          
          const projectsExist = result && result.exists;
          
          if (!projectsExist) {
            console.log('[ActivityController] Table projects non trouvée, création...');
            db.run(`
              CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'active',
                start_date TEXT,
                end_date TEXT,
                client_id INTEGER,
                created_at TEXT,
                updated_at TEXT
              )
            `, [], (createProjectsErr) => {
              if (createProjectsErr) {
                console.error('[ActivityController] Erreur lors de la création de la table projects:', createProjectsErr);
                return reject(createProjectsErr);
              }
              
              console.log('[ActivityController] Table projects créée avec succès');
              proceedWithActivities();
            });
          } else {
            proceedWithActivities();
          }
        });
      }
      
      // Vérifier et créer la table activities
      function proceedWithActivities() {
        db.get("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'activities')", [], (err, result) => {
          if (err) {
            console.error('[ActivityController] Erreur lors de la vérification de la table activities:', err);
            return reject(err);
          }
          
          const activitiesExist = result && result.exists;
          
          if (!activitiesExist) {
            console.log('[ActivityController] Table activities non trouvée, création...');
            db.run(`
              CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                description TEXT NOT NULL,
                planned_time INTEGER DEFAULT 0,
                actual_time INTEGER DEFAULT 0,
                date TEXT NOT NULL,
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'planned',
                project_id INTEGER,
                lead_id INTEGER,
                lead_name TEXT,
                created_at TEXT,
                updated_at TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
                FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
              )
            `, [], (createActivitiesErr) => {
              if (createActivitiesErr) {
                console.error('[ActivityController] Erreur lors de la création de la table activities:', createActivitiesErr);
                return reject(createActivitiesErr);
              }
              
              console.log('[ActivityController] Table activities créée avec succès');
              resolve();
            });
          } else {
            resolve();
          }
        });
      }
    });
  },
  
  /**
   * Récupérer toutes les activités
   * @param {object} req - Requête Express
   * @param {object} res - Réponse Express
   */
  getAllActivities: (req, res) => {
    const db = req.app.locals.db;
    console.log('[ActivityController] Récupération de toutes les activités');
    
    // S'assurer que toutes les tables nécessaires existent
    activityController.ensureTablesExist(db)
      .then(() => {
        // Les tables existent, récupérer les activités avec jointures
        const query = `
          SELECT a.*, p.name as project_name, l.name as lead_name
          FROM activities a
          LEFT JOIN projects p ON a.project_id = p.id
          LEFT JOIN leads l ON a.lead_id = l.id
          ORDER BY a.date DESC
        `;
        
        db.all(query, [], (queryErr, activities) => {
          if (queryErr) {
            console.error('[ActivityController] Erreur lors de la récupération des activités:', queryErr);
            return res.status(500).json({ 
              message: 'Erreur serveur lors de la récupération des activités',
              details: queryErr.message
            });
          }
          
          console.log(`[ActivityController] ${activities.length} activités récupérées avec succès`);
          res.json(activities);
        });
      })
      .catch((err) => {
        console.error('[ActivityController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Récupérer une activité par son ID
   * @param {object} req - Requête Express
   * @param {object} res - Réponse Express
   */
  getActivityById: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    console.log(`[ActivityController] Récupération de l'activité ID: ${id}`);
    
    // S'assurer que toutes les tables nécessaires existent
    activityController.ensureTablesExist(db)
      .then(() => {
        // Récupérer l'activité avec jointures
        const query = `
          SELECT a.*, p.name as project_name, l.name as lead_name
          FROM activities a
          LEFT JOIN projects p ON a.project_id = p.id
          LEFT JOIN leads l ON a.lead_id = l.id
          WHERE a.id = $1
        `;
        
        db.get(query, [id], (err, activity) => {
          if (err) {
            console.error(`[ActivityController] ERREUR lors de la récupération de l'activité ID ${id}:`, err);
            return res.status(500).json({ 
              message: 'Erreur serveur lors de la récupération de l\'activité',
              details: err.message 
            });
          }
          
          if (!activity) {
            console.log(`[ActivityController] Activité ID ${id} non trouvée`);
            return res.status(404).json({ message: 'Activité non trouvée' });
          }
          
          console.log(`[ActivityController] Activité ID ${id} récupérée avec succès`);
          res.json(activity);
        });
      })
      .catch((err) => {
        console.error('[ActivityController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Créer une nouvelle activité
   * @param {object} req - Requête Express
   * @param {object} res - Réponse Express
   */
  createActivity: (req, res) => {
    const db = req.app.locals.db;
    console.log('[ActivityController] Tentative de création d\'une nouvelle activité');
    console.log('[ActivityController] Données reçues:', JSON.stringify(req.body, null, 2));
    
    // S'assurer que toutes les tables nécessaires existent
    activityController.ensureTablesExist(db)
      .then(() => {
        // Validation des données entrantes
        const {
          type, description, planned_time, date, priority, status, project_id, lead_id, lead_name
        } = req.body;
        
        // Vérifier les données requises
        if (!type || !description || !date) {
          console.log('[ActivityController] Validation échouée - champs requis manquants');
          console.log('[ActivityController] type:', type);
          console.log('[ActivityController] description:', description);
          console.log('[ActivityController] date:', date);
          
          return res.status(400).json({ 
            message: 'Type, description et date sont requis',
            missing: {
              type: !type,
              description: !description,
              date: !date
            }
          });
        }
        
        console.log('[ActivityController] Validation des données réussie');
        
        // Si un lead_name est fourni mais pas de lead_id, créer le lead
        if (lead_name && !lead_id) {
          console.log(`[ActivityController] Lead name fourni sans ID: "${lead_name}", création du lead...`);
          
          const now = new Date().toISOString();
          const insertLeadQuery = `
            INSERT INTO leads (name, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `;
          
          db.run(insertLeadQuery, [lead_name, 'new', now, now], function(leadErr) {
            if (leadErr) {
              console.error('[ActivityController] Erreur lors de la création du lead:', leadErr);
              // Continuer sans lead_id
              insertActivity(null);
            } else {
              const newLeadId = this.lastID;
              console.log(`[ActivityController] Nouveau lead créé avec ID: ${newLeadId}`);
              insertActivity(newLeadId);
            }
          });
        } else {
          // Aucun lead à créer, procéder directement à l'insertion de l'activité
          insertActivity(lead_id);
        }
        
        // Fonction pour insérer l'activité avec ou sans lead_id
        function insertActivity(finalLeadId) {
          // Préparer l'objet d'activité
          const now = new Date().toISOString();
          const query = `
            INSERT INTO activities (
              type, description, planned_time, actual_time, date, 
              priority, status, project_id, lead_id, lead_name, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `;
          
          db.run(query, [
            type,
            description,
            planned_time || 0,
            0, // actual_time initial est 0
            date,
            priority || 'medium',
            status || 'planned',
            project_id || null,
            finalLeadId || null,
            lead_name || null,
            now,
            now
          ], function(err) {
            if (err) {
              console.error('[ActivityController] ERREUR lors de la création de l\'activité:', err);
              return res.status(500).json({ 
                message: 'Erreur serveur lors de la création de l\'activité',
                details: err.message,
                type: err.name || 'Unknown'
              });
            }
            
            const newActivityId = this.lastID;
            
            // Récupérer l'activité nouvellement créée
            const getQuery = `
              SELECT a.*, p.name as project_name, l.name as lead_name
              FROM activities a
              LEFT JOIN projects p ON a.project_id = p.id
              LEFT JOIN leads l ON a.lead_id = l.id
              WHERE a.id = $1
            `;
            
            db.get(getQuery, [newActivityId], (getErr, newActivity) => {
              if (getErr) {
                console.error('[ActivityController] ERREUR lors de la récupération de la nouvelle activité:', getErr);
                return res.status(201).json({ 
                  id: newActivityId, 
                  message: 'Activité créée mais impossible de récupérer les détails' 
                });
              }
              
              console.log('[ActivityController] Activité créée avec succès:', JSON.stringify(newActivity, null, 2));
              res.status(201).json(newActivity);
            });
          });
        }
      })
      .catch((err) => {
        console.error('[ActivityController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Mettre à jour une activité existante
   * @param {object} req - Requête Express
   * @param {object} res - Réponse Express
   */
  updateActivity: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    console.log(`[ActivityController] Tentative de mise à jour de l'activité ID: ${id}`);
    console.log('[ActivityController] Données de mise à jour:', JSON.stringify(req.body, null, 2));
    
    // S'assurer que toutes les tables nécessaires existent
    activityController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'activité existe
        db.get("SELECT * FROM activities WHERE id = $1", [id], (err, activity) => {
          if (err) {
            return handleError(res, err, 'la vérification de l\'activité');
          }
          
          if (!activity) {
            console.log(`[ActivityController] Activité ID ${id} non trouvée`);
            return res.status(404).json({ message: 'Activité non trouvée' });
          }
          
          const updateData = req.body;
          
          // Vérifier si des données ont été fournies
          if (Object.keys(updateData).length === 0) {
            console.log('[ActivityController] Aucune donnée fournie pour la mise à jour');
            return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
          }
          
          // Si lead_name est mis à jour mais pas lead_id, vérifier si le lead existe
          if (updateData.lead_name && !updateData.lead_id) {
            console.log(`[ActivityController] Lead name fourni sans ID: "${updateData.lead_name}", vérification...`);
            
            db.get("SELECT id FROM leads WHERE name = $1", [updateData.lead_name], (leadErr, existingLead) => {
              if (leadErr) {
                console.error('[ActivityController] Erreur lors de la vérification du lead:', leadErr);
                // Continuer sans lead_id
                proceedWithUpdate(null);
              } else if (existingLead) {
                // Lead trouvé, utiliser son ID
                console.log(`[ActivityController] Lead existant trouvé avec ID: ${existingLead.id}`);
                proceedWithUpdate(existingLead.id);
              } else {
                // Lead non trouvé, en créer un nouveau
                console.log(`[ActivityController] Lead "${updateData.lead_name}" non trouvé, création...`);
                
                const now = new Date().toISOString();
                const insertLeadQuery = `
                  INSERT INTO leads (name, status, created_at, updated_at)
                  VALUES ($1, $2, $3, $4)
                  RETURNING id
                `;
                
                db.run(insertLeadQuery, [updateData.lead_name, 'new', now, now], function(insertLeadErr) {
                  if (insertLeadErr) {
                    console.error('[ActivityController] Erreur lors de la création du lead:', insertLeadErr);
                    // Continuer sans lead_id
                    proceedWithUpdate(null);
                  } else {
                    const newLeadId = this.lastID;
                    console.log(`[ActivityController] Nouveau lead créé avec ID: ${newLeadId}`);
                    proceedWithUpdate(newLeadId);
                  }
                });
              }
            });
          } else {
            // Pas de modification du lead_name ou lead_id fourni, procéder directement à la mise à jour
            proceedWithUpdate(updateData.lead_id);
          }
          
          // Fonction pour effectuer la mise à jour avec ou sans lead_id
          function proceedWithUpdate(finalLeadId) {
            // Mettre à jour lead_id si nécessaire
            if (finalLeadId !== undefined && finalLeadId !== null) {
              updateData.lead_id = finalLeadId;
            }
            
            // Construire la requête de mise à jour
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;
            
            for (const [key, value] of Object.entries(updateData)) {
              if (
                ['type', 'description', 'planned_time', 'actual_time', 'date', 
                'priority', 'status', 'project_id', 'lead_id', 'lead_name'].includes(key)
              ) {
                updateFields.push(`${key} = $${paramIndex}`);
                updateValues.push(value);
                paramIndex++;
              }
            }
            
            // Ajouter la date de mise à jour
            updateFields.push(`updated_at = $${paramIndex}`);
            updateValues.push(new Date().toISOString());
            paramIndex++;
            
            // Ajouter l'ID à la fin pour la clause WHERE
            updateValues.push(id);
            
            const updateQuery = `
              UPDATE activities
              SET ${updateFields.join(', ')}
              WHERE id = $${paramIndex}
            `;
            
            db.run(updateQuery, updateValues, function(updateErr) {
              if (updateErr) {
                console.error(`[ActivityController] ERREUR lors de la mise à jour de l'activité ID ${id}:`, updateErr);
                return res.status(500).json({ 
                  message: 'Erreur serveur lors de la mise à jour de l\'activité',
                  details: updateErr.message 
                });
              }
              
              if (this.changes === 0) {
                console.log(`[ActivityController] Aucune modification effectuée pour l'activité ID ${id}`);
                return res.status(200).json({ 
                  message: 'Aucune modification effectuée',
                  id: id
                });
              }
              
              // Récupérer l'activité mise à jour
              const getQuery = `
                SELECT a.*, p.name as project_name, l.name as lead_name
                FROM activities a
                LEFT JOIN projects p ON a.project_id = p.id
                LEFT JOIN leads l ON a.lead_id = l.id
                WHERE a.id = $1
              `;
              
              db.get(getQuery, [id], (getErr, updatedActivity) => {
                if (getErr) {
                  console.error(`[ActivityController] ERREUR lors de la récupération de l'activité mise à jour:`, getErr);
                  return res.status(200).json({ 
                    message: 'Activité mise à jour mais impossible de récupérer les détails',
                    id: id
                  });
                }
                
                console.log(`[ActivityController] Activité ID ${id} mise à jour avec succès`);
                res.json(updatedActivity);
              });
            });
          }
        });
      })
      .catch((err) => {
        console.error('[ActivityController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Marquer une activité comme terminée
   * @param {object} req - Requête Express
   * @param {object} res - Réponse Express
   */
  completeActivity: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    console.log(`[ActivityController] Tentative de complétion de l'activité ID: ${id}`);
    console.log('[ActivityController] Données reçues:', JSON.stringify(req.body, null, 2));
    
    // S'assurer que toutes les tables nécessaires existent
    activityController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'activité existe
        db.get("SELECT * FROM activities WHERE id = $1", [id], (err, activity) => {
          if (err) {
            return handleError(res, err, 'la vérification de l\'activité');
          }
          
          if (!activity) {
            console.log(`[ActivityController] Activité ID ${id} non trouvée`);
            return res.status(404).json({ message: 'Activité non trouvée' });
          }
          
          const { actual_time } = req.body;
          
          if (actual_time === undefined) {
            console.log('[ActivityController] Temps réel non fourni');
            return res.status(400).json({ message: 'Temps réel requis' });
          }
          
          // Mise à jour de l'activité
          const updateQuery = `
            UPDATE activities
            SET status = 'completed', actual_time = $1, updated_at = $2
            WHERE id = $3
          `;
          
          db.run(updateQuery, [actual_time, new Date().toISOString(), id], function(updateErr) {
            if (updateErr) {
              console.error(`[ActivityController] ERREUR lors de la complétion de l'activité ID ${id}:`, updateErr);
              return res.status(500).json({ 
                message: 'Erreur serveur lors de la complétion de l\'activité',
                details: updateErr.message 
              });
            }
            
            // Récupérer l'activité mise à jour
            const getQuery = `
              SELECT a.*, p.name as project_name, l.name as lead_name
              FROM activities a
              LEFT JOIN projects p ON a.project_id = p.id
              LEFT JOIN leads l ON a.lead_id = l.id
              WHERE a.id = $1
            `;
            
            db.get(getQuery, [id], (getErr, updatedActivity) => {
              if (getErr) {
                console.error(`[ActivityController] ERREUR lors de la récupération de l'activité complétée:`, getErr);
                return res.status(200).json({ 
                  message: 'Activité complétée mais impossible de récupérer les détails',
                  id: id
                });
              }
              
              console.log(`[ActivityController] Activité ID ${id} complétée avec succès`);
              res.json(updatedActivity);
            });
          });
        });
      })
      .catch((err) => {
        console.error('[ActivityController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Supprimer une activité
   * @param {object} req - Requête Express
   * @param {object} res - Réponse Express
   */
  deleteActivity: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    console.log(`[ActivityController] Tentative de suppression de l'activité ID: ${id}`);
    
    // S'assurer que toutes les tables nécessaires existent
    activityController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'activité existe
        db.get("SELECT * FROM activities WHERE id = $1", [id], (err, activity) => {
          if (err) {
            return handleError(res, err, 'la vérification de l\'activité');
          }
          
          if (!activity) {
            console.log(`[ActivityController] Activité ID ${id} non trouvée`);
            return res.status(404).json({ message: 'Activité non trouvée' });
          }
          
          // Supprimer l'activité
          db.run("DELETE FROM activities WHERE id = $1", [id], function(deleteErr) {
            if (deleteErr) {
              console.error(`[ActivityController] ERREUR lors de la suppression de l'activité ID ${id}:`, deleteErr);
              return res.status(500).json({ 
                message: 'Erreur serveur lors de la suppression de l\'activité',
                details: deleteErr.message 
              });
            }
            
            console.log(`[ActivityController] Activité ID ${id} supprimée avec succès`);
            res.json({ message: 'Activité supprimée avec succès' });
          });
        });
      })
      .catch((err) => {
        console.error('[ActivityController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Récupérer les activités récentes pour le tableau de bord
   * @param {object} req - Requête Express
   * @param {object} res - Réponse Express
   */
  getRecentActivities: (req, res) => {
    const db = req.app.locals.db;
    const limit = parseInt(req.query.limit) || 5;
    console.log(`[ActivityController] Récupération des ${limit} activités les plus récentes`);
    
    // S'assurer que toutes les tables nécessaires existent
    activityController.ensureTablesExist(db)
      .then(() => {
        // Récupérer les activités récentes
        const query = `
          SELECT a.*, p.name as project_name, l.name as lead_name
          FROM activities a
          LEFT JOIN projects p ON a.project_id = p.id
          LEFT JOIN leads l ON a.lead_id = l.id
          ORDER BY a.date DESC
          LIMIT $1
        `;
        
        db.all(query, [limit], (queryErr, activities) => {
          if (queryErr) {
            console.error('[ActivityController] Erreur lors de la récupération des activités récentes:', queryErr);
            return res.status(500).json({ 
              message: 'Erreur serveur lors de la récupération des activités récentes',
              details: queryErr.message 
            });
          }
          
          console.log(`[ActivityController] ${activities.length} activités récentes récupérées`);
          res.json(activities);
        });
      })
      .catch((err) => {
        console.error('[ActivityController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  }
};

module.exports = activityController;