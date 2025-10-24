// backend/routes/goalsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les objectifs
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  
  const query = 'SELECT * FROM goals ORDER BY start_date DESC';
  
  db.all(query, [], (err, goals) => {
    if (err) {
      console.error('Erreur lors de la récupération des objectifs:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    res.json(goals);
  });
});

// Obtenir un objectif spécifique avec ses étapes
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
    if (err) {
      console.error('Erreur lors de la récupération de l\'objectif:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }
    
    // Récupérer les étapes (milestones) associées à l'objectif
    db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id', [id], (milestoneErr, milestones) => {
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
});

// Créer un nouvel objectif
router.post('/', (req, res) => {
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
      console.error('Erreur lors de la création de l\'objectif:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    const newGoalId = this.lastID;
    
    // Récupérer l'objectif créé
    db.get('SELECT * FROM goals WHERE id = ?', [newGoalId], (err, goal) => {
      if (err) {
        console.error('Erreur lors de la récupération de l\'objectif créé:', err);
        return res.status(201).json({ id: newGoalId, message: 'Objectif créé' });
      }
      
      res.status(201).json(goal);
    });
  });
});

// Mettre à jour uniquement la progression d'un objectif
router.patch('/:id/progress', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { current_value } = req.body;
  
  console.log(`[GoalsRoutes] Mise à jour de la progression de l'objectif ID ${id} à ${current_value}`);
  
  if (current_value === undefined) {
    return res.status(400).json({ message: 'Valeur actuelle requise' });
  }
  
  // Vérifier si l'objectif existe
  db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
    if (err) {
      console.error('Erreur lors de la vérification de l\'objectif:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }
    
    const query = `
      UPDATE goals
      SET current_value = ?, updated_at = ?
      WHERE id = ?
    `;
    
    const now = new Date().toISOString();
    
    db.run(query, [current_value, now, id], function(err) {
      if (err) {
        console.error('Erreur lors de la mise à jour de la progression:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      // Mettre à jour les étapes si nécessaire
      const updateMilestonesQuery = `
        UPDATE milestones
        SET achieved = CASE WHEN target <= ? THEN 1 ELSE 0 END
        WHERE goal_id = ?
      `;
      
      db.run(updateMilestonesQuery, [current_value, id], (milestoneErr) => {
        if (milestoneErr) {
          console.error('Erreur lors de la mise à jour des étapes:', milestoneErr);
          // Continuer malgré l'erreur
        }
        
        // Récupérer l'objectif mis à jour
        db.get('SELECT * FROM goals WHERE id = ?', [id], (err, updatedGoal) => {
          if (err) {
            console.error('Erreur lors de la récupération de l\'objectif mis à jour:', err);
            return res.status(200).json({ id, message: 'Progression mise à jour' });
          }
          
          // Récupérer les étapes mises à jour
          db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id', [id], (milestoneErr, milestones) => {
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
});

// Mettre à jour un objectif
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
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
  
  // Vérifier si l'objectif existe
  db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
    if (err) {
      console.error('Erreur lors de la vérification de l\'objectif:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }
    
    // Construire la requête de mise à jour
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    
    if (target_value !== undefined) {
      updates.push('target_value = ?');
      params.push(target_value);
    }
    
    if (current_value !== undefined) {
      updates.push('current_value = ?');
      params.push(current_value);
      
      // Si current_value est modifié, mettre à jour les étapes (achieved)
      if (goal.current_value !== current_value) {
        // Cette mise à jour se fera après la mise à jour de l'objectif
      }
    }
    
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    
    if (period !== undefined) {
      updates.push('period = ?');
      params.push(period);
    }
    
    if (start_date !== undefined) {
      updates.push('start_date = ?');
      params.push(start_date);
    }
    
    if (end_date !== undefined) {
      updates.push('end_date = ?');
      params.push(end_date);
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
        console.error('Erreur lors de la mise à jour de l\'objectif:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      // Si current_value a été modifié, mettre à jour les étapes (achieved)
      if (current_value !== undefined && goal.current_value !== current_value) {
        const updateMilestonesQuery = `
          UPDATE milestones
          SET achieved = CASE WHEN target <= ? THEN 1 ELSE 0 END
          WHERE goal_id = ?
        `;
        
        db.run(updateMilestonesQuery, [current_value, id], (milestoneErr) => {
          if (milestoneErr) {
            console.error('Erreur lors de la mise à jour des étapes:', milestoneErr);
            // Continuer malgré l'erreur
          }
        });
      }
      
      // Récupérer l'objectif mis à jour
      db.get('SELECT * FROM goals WHERE id = ?', [id], (err, updatedGoal) => {
        if (err) {
          console.error('Erreur lors de la récupération de l\'objectif mis à jour:', err);
          return res.status(200).json({ id, message: 'Objectif mis à jour' });
        }
        
        // Récupérer les étapes mises à jour
        db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id', [id], (milestoneErr, milestones) => {
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

// Supprimer un objectif
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  // Vérifier si l'objectif existe
  db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
    if (err) {
      console.error('Erreur lors de la vérification de l\'objectif:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }
    
    // Supprimer l'objectif (les étapes seront supprimées automatiquement grâce à ON DELETE CASCADE)
    db.run('DELETE FROM goals WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression de l\'objectif:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      res.json({ message: 'Objectif supprimé avec succès' });
    });
  });
});

// Obtenir les étapes d'un objectif
router.get('/:id/milestones', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  // Vérifier si l'objectif existe
  db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
    if (err) {
      console.error('Erreur lors de la vérification de l\'objectif:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }
    
    // Récupérer les étapes
    db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id', [id], (err, milestones) => {
      if (err) {
        console.error('Erreur lors de la récupération des étapes:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      res.json(milestones || []);
    });
  });
});

// Ajouter une étape à un objectif
router.post('/:id/milestones', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { name, target } = req.body;
  
  if (!name || target === undefined) {
    return res.status(400).json({ message: 'Nom et valeur cible sont requis' });
  }
  
  // Vérifier si l'objectif existe
  db.get('SELECT * FROM goals WHERE id = ?', [id], (err, goal) => {
    if (err) {
      console.error('Erreur lors de la vérification de l\'objectif:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!goal) {
      return res.status(404).json({ message: 'Objectif non trouvé' });
    }
    
    // Créer la table milestones si elle n'existe pas
    db.run(`
      CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target REAL NOT NULL,
        achieved BOOLEAN DEFAULT 0,
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
      )
    `, (tableErr) => {
      if (tableErr) {
        console.error('Erreur lors de la création de la table milestones:', tableErr);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      // Déterminer si l'étape est déjà atteinte
      const achieved = goal.current_value >= target ? 1 : 0;
      
      const query = `
        INSERT INTO milestones (goal_id, name, target, achieved)
        VALUES (?, ?, ?, ?)
      `;
      
      db.run(query, [id, name, target, achieved], function(insertErr) {
        if (insertErr) {
          console.error('Erreur lors de la création de l\'étape:', insertErr);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        const newMilestoneId = this.lastID;
        
        // Récupérer l'étape créée
        db.get('SELECT * FROM milestones WHERE id = ?', [newMilestoneId], (getErr, milestone) => {
          if (getErr) {
            console.error('Erreur lors de la récupération de l\'étape:', getErr);
            return res.status(201).json({ id: newMilestoneId, message: 'Étape créée' });
          }
          
          res.status(201).json(milestone);
        });
      });
    });
  });
});

// Mettre à jour une étape
router.put('/:goalId/milestones/:milestoneId', (req, res) => {
  const db = req.app.locals.db;
  const { goalId, milestoneId } = req.params;
  const { name, target, achieved } = req.body;
  
  // Vérifier si l'étape existe et appartient à l'objectif
  db.get(
    'SELECT * FROM milestones WHERE id = ? AND goal_id = ?', 
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
      
      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      
      if (target !== undefined) {
        updates.push('target = ?');
        params.push(target);
      }
      
      if (achieved !== undefined) {
        updates.push('achieved = ?');
        params.push(achieved ? 1 : 0);
      }
      
      // Ajouter les IDs pour la clause WHERE
      params.push(milestoneId);
      params.push(goalId);

      const query = `
        UPDATE milestones
        SET ${updates.join(', ')}
        WHERE id = ? AND goal_id = ?
      `;

      db.run(query, params, function(updateErr) {
        if (updateErr) {
          console.error('Erreur lors de la mise à jour de l\'étape:', updateErr);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        // Récupérer l'étape mise à jour
        db.get('SELECT * FROM milestones WHERE id = ?', [milestoneId], (getErr, updatedMilestone) => {
          if (getErr) {
            console.error('Erreur lors de la récupération de l\'étape mise à jour:', getErr);
            return res.status(200).json({ id: milestoneId, message: 'Étape mise à jour' });
          }
          
          res.json(updatedMilestone);
        });
      });
    }
  );
});

// Supprimer une étape
router.delete('/:goalId/milestones/:milestoneId', (req, res) => {
  const db = req.app.locals.db;
  const { goalId, milestoneId } = req.params;

  // Vérifier si l'étape existe et appartient à l'objectif
  db.get(
    'SELECT * FROM milestones WHERE id = ? AND goal_id = ?', 
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
        'DELETE FROM milestones WHERE id = ? AND goal_id = ?', 
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
});

module.exports = router;