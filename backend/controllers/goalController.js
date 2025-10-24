// backend/controllers/goalController.js

/**
 * Contrôleur pour la gestion des objectifs
 */
const goalController = {
  /**
   * Fonction utilitaire pour s'assurer que la table goals existe
   */
  ensureTablesExist: function(db) {
    return new Promise((resolve, reject) => {
      console.log('[GoalController] Vérification et création des tables si nécessaire');
      
      // Vérifier et créer la table goals
      db.get("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'goals')", [], (err, result) => {
        if (err) {
          console.error('[GoalController] Erreur lors de la vérification de la table goals:', err);
          return reject(err);
        }
        
        const goalsExist = result && result.exists;
        
        if (!goalsExist) {
          console.log('[GoalController] Table goals non trouvée, création...');
          db.run(`
            CREATE TABLE IF NOT EXISTS goals (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL,
              description TEXT,
              target_value REAL NOT NULL,
              current_value REAL DEFAULT 0,
              category TEXT NOT NULL,
              period TEXT NOT NULL,
              start_date TEXT NOT NULL,
              end_date TEXT NOT NULL,
              created_at TEXT,
              updated_at TEXT
            )
          `, [], (createGoalsErr) => {
            if (createGoalsErr) {
              console.error('[GoalController] Erreur lors de la création de la table goals:', createGoalsErr);
              return reject(createGoalsErr);
            }
            
            console.log('[GoalController] Table goals créée avec succès');
            proceedWithMilestones();
          });
        } else {
          proceedWithMilestones();
        }
      });
      
      // Vérifier et créer la table milestones
      function proceedWithMilestones() {
        db.get("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'milestones')", [], (err, result) => {
          if (err) {
            console.error('[GoalController] Erreur lors de la vérification de la table milestones:', err);
            return reject(err);
          }
          
          const milestonesExist = result && result.exists;
          
          if (!milestonesExist) {
            console.log('[GoalController] Table milestones non trouvée, création...');
            db.run(`
              CREATE TABLE IF NOT EXISTS milestones (
                id SERIAL PRIMARY KEY,
                goal_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                target REAL NOT NULL,
                achieved BOOLEAN DEFAULT false,
                FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
              )
            `, [], (createMilestonesErr) => {
              if (createMilestonesErr) {
                console.error('[GoalController] Erreur lors de la création de la table milestones:', createMilestonesErr);
                return reject(createMilestonesErr);
              }
              
              console.log('[GoalController] Table milestones créée avec succès');
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
   * Récupérer tous les objectifs
   */
  getAllGoals: (req, res) => {
    const db = req.app.locals.db;
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        const query = 'SELECT * FROM goals ORDER BY start_date DESC';
        
        db.all(query, [], (err, goals) => {
          if (err) {
            console.error('Erreur lors de la récupération des objectifs:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          res.json(goals);
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Récupérer un objectif spécifique avec ses étapes
   */
  getGoalById: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        db.get('SELECT * FROM goals WHERE id = $1', [id], (err, goal) => {
          if (err) {
            console.error('Erreur lors de la récupération de l\'objectif:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          if (!goal) {
            return res.status(404).json({ message: 'Objectif non trouvé' });
          }
          
          // Récupérer les étapes (milestones) associées à l'objectif
          db.all('SELECT * FROM milestones WHERE goal_id = $1 ORDER BY id', [id], (milestoneErr, milestones) => {
            if (milestoneErr) {
              console.error('Erreur lors de la récupération des étapes:', milestoneErr);
              // Renvoyer l'objectif sans les étapes
              return res.json(goal);
            }
            
            // Ajouter les étapes à l'objectif
            goal.milestones = milestones || [];
            res.json(goal);
          });
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Créer un nouvel objectif
   */
  createGoal: (req, res) => {
    const db = req.app.locals.db;
    const { 
      name, 
      description, 
      target_value, 
      current_value,
      category,
      period,
      start_date,
      end_date
    } = req.body;
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        if (!name || !target_value || !category || !period || !start_date || !end_date) {
          return res.status(400).json({ 
            message: 'Nom, valeur cible, catégorie, période, date de début et date de fin sont requis' 
          });
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
            console.error('Erreur lors de la création de l\'objectif:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          const newGoalId = this.lastID;
          
          // Récupérer l'objectif créé
          db.get('SELECT * FROM goals WHERE id = $1', [newGoalId], (err, goal) => {
            if (err) {
              console.error('Erreur lors de la récupération de l\'objectif créé:', err);
              return res.status(201).json({ id: newGoalId, message: 'Objectif créé' });
            }
            
            res.status(201).json(goal);
          });
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Mettre à jour uniquement la progression (current_value) d'un objectif
   */
  updateGoalProgress: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { current_value } = req.body;

    console.log(`[GoalController] Mise à jour de la progression de l'objectif ID ${id} à ${current_value}`);
    
    if (current_value === undefined) {
      return res.status(400).json({ message: 'Valeur actuelle requise' });
    }

    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'objectif existe
        db.get('SELECT * FROM goals WHERE id = $1', [id], (err, goal) => {
          if (err) {
            console.error('Erreur lors de la vérification de l\'objectif:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          if (!goal) {
            return res.status(404).json({ message: 'Objectif non trouvé' });
          }
          
          const query = `
            UPDATE goals
            SET current_value = $1, updated_at = $2
            WHERE id = $3
          `;
          
          const now = new Date().toISOString();
          
          db.run(query, [current_value, now, id], function(err) {
            if (err) {
              console.error('Erreur lors de la mise à jour de la progression:', err);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            // Mettre à jour les étapes (achieved) si nécessaire
            const updateMilestonesQuery = `
              UPDATE milestones
              SET achieved = CASE WHEN target <= $1 THEN true ELSE false END
              WHERE goal_id = $2
            `;
            
            db.run(updateMilestonesQuery, [current_value, id], (milestoneErr) => {
              if (milestoneErr) {
                console.error('Erreur lors de la mise à jour des étapes:', milestoneErr);
                // Continuer malgré l'erreur
              }
              
              // Récupérer l'objectif mis à jour
              db.get('SELECT * FROM goals WHERE id = $1', [id], (err, updatedGoal) => {
                if (err) {
                  console.error('Erreur lors de la récupération de l\'objectif mis à jour:', err);
                  return res.status(200).json({ id, message: 'Progression mise à jour' });
                }
                
                // Récupérer les étapes mises à jour
                db.all('SELECT * FROM milestones WHERE goal_id = $1 ORDER BY id', [id], (milestoneErr, milestones) => {
                  if (milestoneErr) {
                    console.error('Erreur lors de la récupération des étapes mises à jour:', milestoneErr);
                    return res.json(updatedGoal);
                  }
                  
                  updatedGoal.milestones = milestones || [];
                  res.json(updatedGoal);
                });
              });
            });
          });
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Mettre à jour un objectif existant
   */
  updateGoal: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const updateData = req.body;
    
    console.log(`[GoalController] Tentative de mise à jour de l'objectif ID ${id}:`, updateData);
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'objectif existe
        db.get('SELECT * FROM goals WHERE id = $1', [id], (err, goal) => {
          if (err) {
            console.error('Erreur lors de la vérification de l\'objectif:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          if (!goal) {
            return res.status(404).json({ message: 'Objectif non trouvé' });
          }
          
          // Si c'est juste une mise à jour de current_value, utiliser updateGoalProgress
          if (Object.keys(updateData).length === 1 && updateData.current_value !== undefined) {
            return goalController.updateGoalProgress(req, res);
          }
          
          // Pour les autres mises à jour complètes
          // Construire la requête de mise à jour
          const updates = [];
          const params = [];
          let paramIndex = 1;
          
          // Ajouter uniquement les champs à mettre à jour
          if (updateData.name !== undefined && updateData.name !== '') {
            updates.push(`name = $${paramIndex++}`);
            params.push(updateData.name);
          }
          
          if (updateData.description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(updateData.description);
          }
          
          if (updateData.target_value !== undefined && !isNaN(parseFloat(updateData.target_value))) {
            updates.push(`target_value = $${paramIndex++}`);
            params.push(parseFloat(updateData.target_value));
          }
          
          if (updateData.current_value !== undefined && !isNaN(parseFloat(updateData.current_value))) {
            updates.push(`current_value = $${paramIndex++}`);
            params.push(parseFloat(updateData.current_value));
          }
          
          if (updateData.category !== undefined && updateData.category !== '') {
            updates.push(`category = $${paramIndex++}`);
            params.push(updateData.category);
          }
          
          if (updateData.period !== undefined && updateData.period !== '') {
            updates.push(`period = $${paramIndex++}`);
            params.push(updateData.period);
          }
          
          if (updateData.start_date !== undefined && updateData.start_date !== '') {
            updates.push(`start_date = $${paramIndex++}`);
            params.push(updateData.start_date);
          }
          
          if (updateData.end_date !== undefined && updateData.end_date !== '') {
            updates.push(`end_date = $${paramIndex++}`);
            params.push(updateData.end_date);
          }
          
          // Ajouter la date de mise à jour
          updates.push(`updated_at = $${paramIndex++}`);
          params.push(new Date().toISOString());
          
          // Si aucun champ à mettre à jour
          if (updates.length === 1) { // Seulement updated_at
            return res.status(400).json({ message: 'Aucun champ valide à mettre à jour' });
          }
          
          // Ajouter l'ID pour la clause WHERE
          params.push(id);
          
          const query = `
            UPDATE goals
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
          `;
          
          console.log(`[GoalController] Requête de mise à jour: ${query}`);
          console.log(`[GoalController] Paramètres:`, params);
          
          db.run(query, params, function(err) {
            if (err) {
              console.error('Erreur lors de la mise à jour de l\'objectif:', err);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            // Si current_value a été modifié, mettre à jour les étapes (achieved)
            if (updateData.current_value !== undefined && goal.current_value !== updateData.current_value) {
              const updateMilestonesQuery = `
                UPDATE milestones
                SET achieved = CASE WHEN target <= $1 THEN true ELSE false END
                WHERE goal_id = $2
              `;
              
              db.run(updateMilestonesQuery, [updateData.current_value, id], (milestoneErr) => {
                if (milestoneErr) {
                  console.error('Erreur lors de la mise à jour des étapes:', milestoneErr);
                  // Continuer malgré l'erreur
                }
              });
            }
            
            // Récupérer l'objectif mis à jour
            db.get('SELECT * FROM goals WHERE id = $1', [id], (err, updatedGoal) => {
              if (err) {
                console.error('Erreur lors de la récupération de l\'objectif mis à jour:', err);
                return res.status(200).json({ id, message: 'Objectif mis à jour' });
              }
              
              // Récupérer les étapes mises à jour
              db.all('SELECT * FROM milestones WHERE goal_id = $1 ORDER BY id', [id], (milestoneErr, milestones) => {
                if (milestoneErr) {
                  console.error('Erreur lors de la récupération des étapes mises à jour:', milestoneErr);
                  return res.json(updatedGoal);
                }
                
                updatedGoal.milestones = milestones || [];
                res.json(updatedGoal);
              });
            });
          });
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Supprimer un objectif
   */
  deleteGoal: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'objectif existe
        db.get('SELECT * FROM goals WHERE id = $1', [id], (err, goal) => {
          if (err) {
            console.error('Erreur lors de la vérification de l\'objectif:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          if (!goal) {
            return res.status(404).json({ message: 'Objectif non trouvé' });
          }
          
          // Supprimer l'objectif (les étapes seront supprimées automatiquement grâce à ON DELETE CASCADE)
          db.run('DELETE FROM goals WHERE id = $1', [id], function(err) {
            if (err) {
              console.error('Erreur lors de la suppression de l\'objectif:', err);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            res.json({ message: 'Objectif supprimé avec succès' });
          });
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Récupérer les étapes d'un objectif
   */
  getGoalMilestones: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'objectif existe
        db.get('SELECT * FROM goals WHERE id = $1', [id], (err, goal) => {
          if (err) {
            console.error('Erreur lors de la vérification de l\'objectif:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          if (!goal) {
            return res.status(404).json({ message: 'Objectif non trouvé' });
          }
          
          // Récupérer les étapes
          db.all('SELECT * FROM milestones WHERE goal_id = $1 ORDER BY id', [id], (err, milestones) => {
            if (err) {
              console.error('Erreur lors de la récupération des étapes:', err);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            res.json(milestones || []);
          });
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Ajouter une étape à un objectif
   */
  addMilestone: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { name, target } = req.body;
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        if (!name || target === undefined) {
          return res.status(400).json({ message: 'Nom et valeur cible sont requis' });
        }
        
        // Vérifier si l'objectif existe
        db.get('SELECT * FROM goals WHERE id = $1', [id], (err, goal) => {
          if (err) {
            console.error('Erreur lors de la vérification de l\'objectif:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          if (!goal) {
            return res.status(404).json({ message: 'Objectif non trouvé' });
          }
          
          // Déterminer si l'étape est déjà atteinte
          const achieved = goal.current_value >= target;
          
          const query = `
            INSERT INTO milestones (goal_id, name, target, achieved)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `;
          
          db.run(query, [id, name, target, achieved], function(insertErr) {
            if (insertErr) {
              console.error('Erreur lors de la création de l\'étape:', insertErr);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            const newMilestoneId = this.lastID;
            
            // Récupérer l'étape créée
            db.get('SELECT * FROM milestones WHERE id = $1', [newMilestoneId], (getErr, milestone) => {
              if (getErr) {
                console.error('Erreur lors de la récupération de l\'étape:', getErr);
                return res.status(201).json({ id: newMilestoneId, message: 'Étape créée' });
              }
              
              res.status(201).json(milestone);
            });
          });
        });
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },
  
  /**
   * Mettre à jour une étape
   */
  updateMilestone: (req, res) => {
    const db = req.app.locals.db;
    const { goalId, milestoneId } = req.params;
    const { name, target, achieved } = req.body;
    
    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'étape existe et appartient à l'objectif
        db.get(
          'SELECT * FROM milestones WHERE id = $1 AND goal_id = $2', 
          [milestoneId, goalId], 
          (err, milestone) => {
            if (err) {
              console.error('Erreur lors de la vérification de l\'étape:', err);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            if (!milestone) {
              return res.status(404).json({ message: 'Étape non trouvée' });
            }
            
            // Construire la requête de mise à jour
            const updates = [];
            const params = [];
            let paramIndex = 1;

            if (name !== undefined && name !== '') {
              updates.push(`name = $${paramIndex++}`);
              params.push(name);
            }

            if (target !== undefined && !isNaN(parseFloat(target))) {
              updates.push(`target = $${paramIndex++}`);
              params.push(parseFloat(target));
            }

            if (achieved !== undefined) {
              updates.push(`achieved = $${paramIndex++}`);
              params.push(achieved);
            }

            // Si aucun champ à mettre à jour
            if (updates.length === 0) {
              return res.status(400).json({ message: 'Aucun champ valide à mettre à jour' });
            }

            // Ajouter les IDs pour la clause WHERE
            params.push(milestoneId);
            params.push(goalId);

            const query = `
              UPDATE milestones
              SET ${updates.join(', ')}
              WHERE id = $${paramIndex++} AND goal_id = $${paramIndex}
            `;

            db.run(query, params, function(updateErr) {
              if (updateErr) {
                console.error('Erreur lors de la mise à jour de l\'étape:', updateErr);
                return res.status(500).json({ message: 'Erreur serveur' });
              }
              
              // Récupérer l'étape mise à jour
              db.get('SELECT * FROM milestones WHERE id = $1', [milestoneId], (getErr, updatedMilestone) => {
                if (getErr) {
                  console.error('Erreur lors de la récupération de l\'étape mise à jour:', getErr);
                  return res.status(200).json({ id: milestoneId, message: 'Étape mise à jour' });
                }
                
                res.json(updatedMilestone);
              });
            });
          }
        );
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  },

  /**
   * Supprimer une étape
   */
  deleteMilestone: (req, res) => {
    const db = req.app.locals.db;
    const { goalId, milestoneId } = req.params;

    // S'assurer que toutes les tables nécessaires existent
    goalController.ensureTablesExist(db)
      .then(() => {
        // Vérifier si l'étape existe et appartient à l'objectif
        db.get(
          'SELECT * FROM milestones WHERE id = $1 AND goal_id = $2', 
          [milestoneId, goalId], 
          (err, milestone) => {
            if (err) {
              console.error('Erreur lors de la vérification de l\'étape:', err);
              return res.status(500).json({ message: 'Erreur serveur' });
            }

            if (!milestone) {
              return res.status(404).json({ message: 'Étape non trouvée' });
            }

            // Supprimer l'étape
            db.run(
              'DELETE FROM milestones WHERE id = $1 AND goal_id = $2', 
              [milestoneId, goalId], 
              function(deleteErr) {
                if (deleteErr) {
                  console.error('Erreur lors de la suppression de l\'étape:', deleteErr);
                  return res.status(500).json({ message: 'Erreur serveur' });
                }
                
                res.json({ message: 'Étape supprimée avec succès' });
              }
            );
          }
        );
      })
      .catch((err) => {
        console.error('[GoalController] Erreur lors de la vérification/création des tables:', err);
        res.status(500).json({ 
          message: 'Erreur serveur lors de la préparation de la base de données',
          details: err.message
        });
      });
  }
};

module.exports = goalController;