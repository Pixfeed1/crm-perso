// backend/routes/projectsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les projets
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  
  const query = `
    SELECT p.*, l.name as lead_name 
    FROM projects p
    LEFT JOIN leads l ON p.lead_id = l.id
    ORDER BY p.start_date DESC
  `;
  
  db.all(query, [], (err, projects) => {
    if (err) {
      console.error('Erreur lors de la récupération des projets:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    res.json(projects);
  });
});

// Obtenir un projet spécifique
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  const query = `
    SELECT p.*, l.name as lead_name 
    FROM projects p
    LEFT JOIN leads l ON p.lead_id = l.id
    WHERE p.id = ?
  `;
  
  db.get(query, [id], (err, project) => {
    if (err) {
      console.error('Erreur lors de la récupération du projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }
    
    // Récupérer les tâches associées au projet
    db.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY id', [id], (taskErr, tasks) => {
      if (taskErr) {
        console.error('Erreur lors de la récupération des tâches:', taskErr);
        return res.json(project); // Retourner le projet sans les tâches
      }
      
      project.tasks = tasks || [];
      res.json(project);
    });
  });
});

// Créer un nouveau projet
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, type, description, start_date, end_date, status, amount, lead_id } = req.body;
  
  if (!name || !type || !status) {
    return res.status(400).json({ message: 'Nom, type et statut sont requis' });
  }
  
  const query = `
    INSERT INTO projects (
      name, type, description, start_date, end_date, 
      status, amount, lead_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const now = new Date().toISOString();
  
  db.run(query, [
    name, 
    type, 
    description || null, 
    start_date, 
    end_date, 
    status, 
    amount || null, 
    lead_id || null, 
    now, 
    now
  ], function(err) {
    if (err) {
      console.error('Erreur lors de la création du projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    const newProjectId = this.lastID;
    
    // Récupérer le projet créé
    db.get(
      'SELECT p.*, l.name as lead_name FROM projects p LEFT JOIN leads l ON p.lead_id = l.id WHERE p.id = ?', 
      [newProjectId], 
      (err, project) => {
        if (err) {
          console.error('Erreur lors de la récupération du nouveau projet:', err);
          return res.status(201).json({ id: newProjectId, message: 'Projet créé' });
        }
        
        res.status(201).json(project);
      }
    );
  });
});

// Mettre à jour un projet
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { name, type, description, start_date, end_date, status, amount, lead_id } = req.body;
  
  // Vérifier si le projet existe
  db.get('SELECT * FROM projects WHERE id = ?', [id], (err, project) => {
    if (err) {
      console.error('Erreur lors de la vérification du projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }
    
    // Construire la requête de mise à jour
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    
    if (start_date !== undefined) {
      updates.push('start_date = ?');
      params.push(start_date);
    }
    
    if (end_date !== undefined) {
      updates.push('end_date = ?');
      params.push(end_date);
    }
    
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    
    if (amount !== undefined) {
      updates.push('amount = ?');
      params.push(amount);
    }
    
    if (lead_id !== undefined) {
      updates.push('lead_id = ?');
      params.push(lead_id);
    }
    
    // Ajouter la date de mise à jour
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    
    // Ajouter l'ID pour la clause WHERE
    params.push(id);
    
    const query = `
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = ?
    `;
    
    db.run(query, params, function(err) {
      if (err) {
        console.error('Erreur lors de la mise à jour du projet:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      // Récupérer le projet mis à jour
      db.get(
        'SELECT p.*, l.name as lead_name FROM projects p LEFT JOIN leads l ON p.lead_id = l.id WHERE p.id = ?', 
        [id], 
        (err, updatedProject) => {
          if (err) {
            console.error('Erreur lors de la récupération du projet mis à jour:', err);
            return res.status(200).json({ id, message: 'Projet mis à jour' });
          }
          
          res.json(updatedProject);
        }
      );
    });
  });
});

// Supprimer un projet
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  // Vérifier si le projet existe
  db.get('SELECT * FROM projects WHERE id = ?', [id], (err, project) => {
    if (err) {
      console.error('Erreur lors de la vérification du projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }
    
    // Supprimer les tâches associées
    db.run('DELETE FROM tasks WHERE project_id = ?', [id], (taskErr) => {
      if (taskErr) {
        console.error('Erreur lors de la suppression des tâches:', taskErr);
        // Continuer malgré l'erreur
      }
      
      // Supprimer le projet
      db.run('DELETE FROM projects WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('Erreur lors de la suppression du projet:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        res.json({ message: 'Projet supprimé avec succès' });
      });
    });
  });
});

// Ajouter une tâche à un projet
router.post('/:id/tasks', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { title, description, deadline, completed } = req.body;
  
  if (!title) {
    return res.status(400).json({ message: 'Titre de la tâche requis' });
  }
  
  // Vérifier si le projet existe
  db.get('SELECT * FROM projects WHERE id = ?', [id], (err, project) => {
    if (err) {
      console.error('Erreur lors de la vérification du projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
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
        console.error('Erreur lors de la création de la table tasks:', tableErr);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      // Insérer la tâche
      const query = `
        INSERT INTO tasks (project_id, title, description, deadline, completed)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        id, 
        title, 
        description || null, 
        deadline || null, 
        completed ? 1 : 0
      ], function(insertErr) {
        if (insertErr) {
          console.error('Erreur lors de la création de la tâche:', insertErr);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        const newTaskId = this.lastID;
        
        // Récupérer la tâche créée
        db.get('SELECT * FROM tasks WHERE id = ?', [newTaskId], (getErr, task) => {
          if (getErr) {
            console.error('Erreur lors de la récupération de la tâche:', getErr);
            return res.status(201).json({ id: newTaskId, message: 'Tâche créée' });
          }
          
          res.status(201).json(task);
        });
      });
    });
  });
});

// Mettre à jour une tâche
router.put('/:projectId/tasks/:taskId', (req, res) => {
  const db = req.app.locals.db;
  const { projectId, taskId } = req.params;
  const { title, description, deadline, completed } = req.body;
  
  // Vérifier si la tâche existe et appartient au projet
  db.get(
    'SELECT * FROM tasks WHERE id = ? AND project_id = ?', 
    [taskId, projectId], 
    (err, task) => {
      if (err) {
        console.error('Erreur lors de la vérification de la tâche:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      if (!task) {
        return res.status(404).json({ message: 'Tâche non trouvée' });
      }
      
      // Construire la requête de mise à jour
      const updates = [];
      const params = [];
      
      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }
      
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }
      
      if (deadline !== undefined) {
        updates.push('deadline = ?');
        params.push(deadline);
      }
      
      if (completed !== undefined) {
        updates.push('completed = ?');
        params.push(completed ? 1 : 0);
      }
      
      // Ajouter les IDs pour la clause WHERE
      params.push(taskId);
      params.push(projectId);
      
      const query = `
        UPDATE tasks
        SET ${updates.join(', ')}
        WHERE id = ? AND project_id = ?
      `;
      
      db.run(query, params, function(updateErr) {
        if (updateErr) {
          console.error('Erreur lors de la mise à jour de la tâche:', updateErr);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        // Récupérer la tâche mise à jour
        db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (getErr, updatedTask) => {
          if (getErr) {
            console.error('Erreur lors de la récupération de la tâche mise à jour:', getErr);
            return res.status(200).json({ id: taskId, message: 'Tâche mise à jour' });
          }
          
          res.json(updatedTask);
        });
      });
    }
  );
});

// Supprimer une tâche
router.delete('/:projectId/tasks/:taskId', (req, res) => {
  const db = req.app.locals.db;
  const { projectId, taskId } = req.params;
  
  // Vérifier si la tâche existe et appartient au projet
  db.get(
    'SELECT * FROM tasks WHERE id = ? AND project_id = ?', 
    [taskId, projectId], 
    (err, task) => {
      if (err) {
        console.error('Erreur lors de la vérification de la tâche:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      if (!task) {
        return res.status(404).json({ message: 'Tâche non trouvée' });
      }
      
      // Supprimer la tâche
      db.run(
        'DELETE FROM tasks WHERE id = ? AND project_id = ?', 
        [taskId, projectId], 
        function(deleteErr) {
          if (deleteErr) {
            console.error('Erreur lors de la suppression de la tâche:', deleteErr);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          res.json({ message: 'Tâche supprimée avec succès' });
        }
      );
    }
  );
});

// ============================================
// ROUTES POUR LES CONTACTS DE PROJET
// ============================================

// Obtenir tous les contacts d'un projet
router.get('/:id/contacts', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  // Vérifier que le projet existe
  db.get('SELECT id FROM projects WHERE id = ?', [id], (err, project) => {
    if (err) {
      console.error('Erreur lors de la vérification du projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Récupérer les contacts du projet avec leurs informations complètes
    const query = `
      SELECT
        pc.id as project_contact_id,
        pc.role,
        pc.created_at as added_at,
        c.id,
        c.lead_id,
        c.name,
        c.position,
        c.email,
        c.phone,
        c.is_primary,
        c.notes,
        l.name as lead_name,
        l.company as lead_company
      FROM project_contacts pc
      INNER JOIN contacts c ON pc.contact_id = c.id
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE pc.project_id = ?
      ORDER BY pc.created_at DESC
    `;

    db.all(query, [id], (err, contacts) => {
      if (err) {
        console.error('Erreur lors de la récupération des contacts du projet:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      res.json(contacts);
    });
  });
});

// Ajouter un contact à un projet
router.post('/:id/contacts', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { contact_id, role } = req.body;

  if (!contact_id) {
    return res.status(400).json({ message: 'contact_id est requis' });
  }

  // Vérifier que le projet existe
  db.get('SELECT id FROM projects WHERE id = ?', [id], (err, project) => {
    if (err) {
      console.error('Erreur lors de la vérification du projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Vérifier que le contact existe
    db.get('SELECT id, name FROM contacts WHERE id = ?', [contact_id], (err, contact) => {
      if (err) {
        console.error('Erreur lors de la vérification du contact:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      if (!contact) {
        return res.status(404).json({ message: 'Contact non trouvé' });
      }

      // Vérifier que le contact n'est pas déjà lié au projet
      db.get(
        'SELECT id FROM project_contacts WHERE project_id = ? AND contact_id = ?',
        [id, contact_id],
        (err, existing) => {
          if (err) {
            console.error('Erreur lors de la vérification du lien existant:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }

          if (existing) {
            return res.status(409).json({ message: 'Ce contact est déjà lié à ce projet' });
          }

          // Ajouter le contact au projet
          const insertQuery = `
            INSERT INTO project_contacts (project_id, contact_id, role, created_at)
            VALUES (?, ?, ?, ?)
          `;

          const now = new Date().toISOString();

          db.run(
            insertQuery,
            [id, contact_id, role || null, now],
            function(err) {
              if (err) {
                console.error('Erreur lors de l\'ajout du contact au projet:', err);
                return res.status(500).json({ message: 'Erreur serveur' });
              }

              // Récupérer le lien créé avec les infos du contact
              const query = `
                SELECT
                  pc.id as project_contact_id,
                  pc.role,
                  pc.created_at as added_at,
                  c.id,
                  c.name,
                  c.position,
                  c.email,
                  c.phone,
                  c.is_primary,
                  l.name as lead_name,
                  l.company as lead_company
                FROM project_contacts pc
                INNER JOIN contacts c ON pc.contact_id = c.id
                LEFT JOIN leads l ON c.lead_id = l.id
                WHERE pc.id = ?
              `;

              db.get(query, [this.lastID], (err, result) => {
                if (err) {
                  console.error('Erreur lors de la récupération du contact ajouté:', err);
                  return res.status(500).json({ message: 'Erreur serveur' });
                }

                res.status(201).json({
                  message: 'Contact ajouté au projet avec succès',
                  data: result
                });
              });
            }
          );
        }
      );
    });
  });
});

// Mettre à jour le rôle d'un contact dans un projet
router.put('/:projectId/contacts/:contactId', (req, res) => {
  const db = req.app.locals.db;
  const { projectId, contactId } = req.params;
  const { role } = req.body;

  // Vérifier que le lien existe
  db.get(
    'SELECT id FROM project_contacts WHERE project_id = ? AND contact_id = ?',
    [projectId, contactId],
    (err, link) => {
      if (err) {
        console.error('Erreur lors de la vérification du lien:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      if (!link) {
        return res.status(404).json({ message: 'Ce contact n\'est pas lié à ce projet' });
      }

      // Mettre à jour le rôle
      db.run(
        'UPDATE project_contacts SET role = ? WHERE project_id = ? AND contact_id = ?',
        [role || null, projectId, contactId],
        function(err) {
          if (err) {
            console.error('Erreur lors de la mise à jour du rôle:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }

          res.json({
            message: 'Rôle du contact mis à jour avec succès',
            role: role
          });
        }
      );
    }
  );
});

// Retirer un contact d'un projet
router.delete('/:projectId/contacts/:contactId', (req, res) => {
  const db = req.app.locals.db;
  const { projectId, contactId } = req.params;

  // Vérifier que le lien existe
  db.get(
    'SELECT id FROM project_contacts WHERE project_id = ? AND contact_id = ?',
    [projectId, contactId],
    (err, link) => {
      if (err) {
        console.error('Erreur lors de la vérification du lien:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      if (!link) {
        return res.status(404).json({ message: 'Ce contact n\'est pas lié à ce projet' });
      }

      // Supprimer le lien
      db.run(
        'DELETE FROM project_contacts WHERE project_id = ? AND contact_id = ?',
        [projectId, contactId],
        function(err) {
          if (err) {
            console.error('Erreur lors de la suppression du lien:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }

          res.json({ message: 'Contact retiré du projet avec succès' });
        }
      );
    }
  );
});

module.exports = router;