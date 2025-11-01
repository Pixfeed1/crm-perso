// backend/controllers/leadController.js

/**
 * Contrôleur pour la gestion des leads (prospects)
 */
const leadController = {
  /**
   * Récupérer tous les leads
   */
  getAllLeads: (req, res) => {
    const db = req.app.locals.db;
    
    const query = `
      SELECT *
      FROM leads
      ORDER BY name ASC
    `;
    
    db.all(query, [], (err, leads) => {
      if (err) {
        console.error('Erreur lors de la récupération des leads:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      res.json(leads);
    });
  },
  
  /**
   * Récupérer un lead spécifique avec ses contacts et projets associés
   */
  getLeadById: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    
    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Erreur lors de la récupération du lead:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      if (!lead) {
        return res.status(404).json({ message: 'Lead non trouvé' });
      }
      
      // Récupérer les contacts associés au lead
      db.all('SELECT * FROM contacts WHERE lead_id = ? ORDER BY name', [id], (contactErr, contacts) => {
        if (contactErr) {
          console.error('Erreur lors de la récupération des contacts:', contactErr);
          // Renvoyer le lead sans les contacts
          return res.json(lead);
        }
        
        // Ajouter les contacts au lead
        lead.contacts = contacts || [];
        
        // Récupérer les projets associés au lead
        db.all('SELECT * FROM projects WHERE lead_id = ? ORDER BY name', [id], (projectErr, projects) => {
          if (projectErr) {
            console.error('Erreur lors de la récupération des projets:', projectErr);
            // Renvoyer le lead avec contacts mais sans projets
            return res.json(lead);
          }
          
          // Ajouter les projets au lead
          lead.projects = projects || [];
          res.json(lead);
        });
      });
    });
  },
  
  /**
   * Créer un nouveau lead
   */
  createLead: (req, res) => {
    const db = req.app.locals.db;
    const { name, company, type, status, source, notes } = req.body;
    
    if (!name || !status) {
      return res.status(400).json({ message: 'Nom et statut sont requis' });
    }
    
    const query = `
      INSERT INTO leads (
        name, company, type, status, source, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const now = new Date().toISOString();
    
    db.run(query, [
      name, 
      company || null, 
      type || 'individual', 
      status, 
      source || null, 
      notes || null, 
      now, 
      now
    ], function(err) {
      if (err) {
        console.error('Erreur lors de la création du lead:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      const newLeadId = this.lastID;
      
      // Récupérer le lead créé
      db.get('SELECT * FROM leads WHERE id = ?', [newLeadId], (err, lead) => {
        if (err) {
          console.error('Erreur lors de la récupération du nouveau lead:', err);
          return res.status(201).json({ id: newLeadId, message: 'Lead créé' });
        }
        
        res.status(201).json(lead);
      });
    });
  },
  
  /**
   * Mettre à jour un lead existant
   */
  updateLead: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { name, company, type, status, source, notes } = req.body;
    
    // Vérifier si le lead existe
    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Erreur lors de la vérification du lead:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      if (!lead) {
        return res.status(404).json({ message: 'Lead non trouvé' });
      }
      
      // Construire la requête de mise à jour
      const updates = [];
      const params = [];
      
      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      
      if (company !== undefined) {
        updates.push('company = ?');
        params.push(company);
      }
      
      if (type !== undefined) {
        updates.push('type = ?');
        params.push(type);
      }
      
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      
      if (source !== undefined) {
        updates.push('source = ?');
        params.push(source);
      }
      
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }
      
      // Ajouter la date de mise à jour
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      
      // Ajouter l'ID pour la clause WHERE
      params.push(id);
      
      const query = `
        UPDATE leads
        SET ${updates.join(', ')}
        WHERE id = ?
      `;
      
      db.run(query, params, function(err) {
        if (err) {
          console.error('Erreur lors de la mise à jour du lead:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        // Récupérer le lead mis à jour
        db.get('SELECT * FROM leads WHERE id = ?', [id], (err, updatedLead) => {
          if (err) {
            console.error('Erreur lors de la récupération du lead mis à jour:', err);
            return res.status(200).json({ id, message: 'Lead mis à jour' });
          }
          
          res.json(updatedLead);
        });
      });
    });
  },
  
  /**
   * Supprimer un lead
   */
  deleteLead: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    
    // Vérifier si le lead existe
    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Erreur lors de la vérification du lead:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      if (!lead) {
        return res.status(404).json({ message: 'Lead non trouvé' });
      }
      
      // Supprimer le lead (les contacts seront supprimés automatiquement grâce à ON DELETE CASCADE)
      db.run('DELETE FROM leads WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('Erreur lors de la suppression du lead:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        res.json({ message: 'Lead supprimé avec succès' });
      });
    });
  },
  
  /**
   * Récupérer tous les contacts d'un lead
   */
  getLeadContacts: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    
    // Vérifier si le lead existe
    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Erreur lors de la vérification du lead:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      if (!lead) {
        return res.status(404).json({ message: 'Lead non trouvé' });
      }
      
      // Récupérer les contacts
      db.all('SELECT * FROM contacts WHERE lead_id = ? ORDER BY name', [id], (err, contacts) => {
        if (err) {
          console.error('Erreur lors de la récupération des contacts:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        res.json(contacts || []);
      });
    });
  },
  
  /**
   * Ajouter un contact à un lead
   */
  addContact: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { name, position, email, phone, is_primary, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Nom du contact requis' });
    }
    
    // Vérifier si le lead existe
    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Erreur lors de la vérification du lead:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      if (!lead) {
        return res.status(404).json({ message: 'Lead non trouvé' });
      }
      
      // Créer la table contacts si elle n'existe pas
      db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lead_id INTEGER,
          name TEXT NOT NULL,
          position TEXT,
          email TEXT,
          phone TEXT,
          is_primary BOOLEAN DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
        )
      `, (tableErr) => {
        if (tableErr) {
          console.error('Erreur lors de la création de la table contacts:', tableErr);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        // Si ce contact est défini comme principal, mettre à jour les autres contacts
        const updatePrimaryQuery = is_primary ? 
          'UPDATE contacts SET is_primary = 0 WHERE lead_id = ?' : null;
        
        // Fonction pour insérer le contact après la mise à jour des contacts principaux
        const insertContact = () => {
          const query = `
            INSERT INTO contacts (lead_id, name, position, email, phone, is_primary, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          const now = new Date().toISOString();
          
          db.run(query, [
            id, 
            name, 
            position || null, 
            email || null, 
            phone || null, 
            is_primary ? 1 : 0, 
            notes || null, 
            now
          ], function(insertErr) {
            if (insertErr) {
              console.error('Erreur lors de la création du contact:', insertErr);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            const newContactId = this.lastID;
            
            // Récupérer le contact créé
            db.get('SELECT * FROM contacts WHERE id = ?', [newContactId], (getErr, contact) => {
              if (getErr) {
                console.error('Erreur lors de la récupération du contact:', getErr);
                return res.status(201).json({ id: newContactId, message: 'Contact créé' });
              }
              
              res.status(201).json(contact);
            });
          });
        };
        
        // Si le contact est principal, mettre à jour les autres contacts
        if (updatePrimaryQuery) {
          db.run(updatePrimaryQuery, [id], (updateErr) => {
            if (updateErr) {
              console.error('Erreur lors de la mise à jour des contacts principaux:', updateErr);
              // Continuer malgré l'erreur
            }
            
            insertContact();
          });
        } else {
          insertContact();
        }
      });
    });
  },
  
  /**
   * Mettre à jour un contact
   */
  updateContact: (req, res) => {
    const db = req.app.locals.db;
    const { leadId, contactId } = req.params;
    const { name, position, email, phone, is_primary, notes } = req.body;
    
    // Vérifier si le contact existe et appartient au lead
    db.get(
      'SELECT * FROM contacts WHERE id = ? AND lead_id = ?', 
      [contactId, leadId], 
      (err, contact) => {
        if (err) {
          console.error('Erreur lors de la vérification du contact:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        if (!contact) {
          return res.status(404).json({ message: 'Contact non trouvé' });
        }
        
        // Si ce contact devient principal, mettre à jour les autres contacts
        let updatePrimaryPromise = Promise.resolve();
        if (is_primary) {
          updatePrimaryPromise = new Promise((resolve, reject) => {
            db.run(
              'UPDATE contacts SET is_primary = 0 WHERE lead_id = ? AND id != ?', 
              [leadId, contactId], 
              (updateErr) => {
                if (updateErr) {
                  console.error('Erreur lors de la mise à jour des contacts principaux:', updateErr);
                  // Continuer malgré l'erreur
                }
                resolve();
              }
            );
          });
        }
        
        // Attendre la mise à jour des contacts principaux si nécessaire
        updatePrimaryPromise.then(() => {
          // Construire la requête de mise à jour
          const updates = [];
          const params = [];
          
          if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
          }
          
          if (position !== undefined) {
            updates.push('position = ?');
            params.push(position);
          }
          
          if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
          }
          
          if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone);
          }
          
          if (is_primary !== undefined) {
            updates.push('is_primary = ?');
            params.push(is_primary ? 1 : 0);
          }
          
          if (notes !== undefined) {
            updates.push('notes = ?');
            params.push(notes);
          }
          
          // Ajouter les IDs pour la clause WHERE
          params.push(contactId);
          params.push(leadId);
          
          const query = `
            UPDATE contacts
            SET ${updates.join(', ')}
            WHERE id = ? AND lead_id = ?
          `;
          
          db.run(query, params, function(updateErr) {
            if (updateErr) {
              console.error('Erreur lors de la mise à jour du contact:', updateErr);
              return res.status(500).json({ message: 'Erreur serveur' });
            }
            
            // Récupérer le contact mis à jour
            db.get('SELECT * FROM contacts WHERE id = ?', [contactId], (getErr, updatedContact) => {
              if (getErr) {
                console.error('Erreur lors de la récupération du contact mis à jour:', getErr);
                return res.status(200).json({ id: contactId, message: 'Contact mis à jour' });
              }
              
              res.json(updatedContact);
            });
          });
        }).catch(error => {
          console.error('Erreur lors de la mise à jour du contact:', error);
          res.status(500).json({ message: 'Erreur serveur' });
        });
      }
    );
  },
  
  /**
   * Supprimer un contact
   */
  deleteContact: (req, res) => {
    const db = req.app.locals.db;
    const { leadId, contactId } = req.params;

    // Vérifier si le contact existe et appartient au lead
    db.get(
      'SELECT * FROM contacts WHERE id = ? AND lead_id = ?',
      [contactId, leadId],
      (err, contact) => {
        if (err) {
          console.error('Erreur lors de la vérification du contact:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }

        if (!contact) {
          return res.status(404).json({ message: 'Contact non trouvé' });
        }

        // Supprimer le contact
        db.run(
          'DELETE FROM contacts WHERE id = ? AND lead_id = ?',
          [contactId, leadId],
          function(deleteErr) {
            if (deleteErr) {
              console.error('Erreur lors de la suppression du contact:', deleteErr);
              return res.status(500).json({ message: 'Erreur serveur' });
            }

            res.json({ message: 'Contact supprimé avec succès' });
          }
        );
      }
    );
  },

  /**
   * Récupérer les statistiques Kanban (nombre de leads par statut + taux de conversion)
   */
  getKanbanStats: (req, res) => {
    const db = req.app.locals.db;

    // Récupérer le nombre de leads par statut
    const statsQuery = `
      SELECT
        status,
        COUNT(*) as count
      FROM leads
      GROUP BY status
    `;

    db.all(statsQuery, [], (err, stats) => {
      if (err) {
        console.error('Erreur lors de la récupération des statistiques Kanban:', err);
        return res.status(500).json({ message: 'Erreur serveur', error: err.message });
      }

      // Créer un objet avec les statistiques par statut
      const statsByStatus = {
        nouveau: { count: 0 },
        prospect: { count: 0 },
        qualifié: { count: 0 },
        négociation: { count: 0 },
        won: { count: 0 },
        lost: { count: 0 }
      };

      // Remplir avec les données de la base
      stats.forEach(stat => {
        if (statsByStatus[stat.status]) {
          statsByStatus[stat.status] = {
            count: stat.count
          };
        }
      });

      // Calculer les totaux
      const totalLeads = stats.reduce((sum, stat) => sum + stat.count, 0);

      // Calculer les taux de conversion
      const activeLeads = (statsByStatus.nouveau?.count || 0) +
                          (statsByStatus.prospect?.count || 0) +
                          (statsByStatus.qualifié?.count || 0) +
                          (statsByStatus.négociation?.count || 0);

      const closedLeads = (statsByStatus.won?.count || 0) + (statsByStatus.lost?.count || 0);

      const winRate = closedLeads > 0
        ? Math.round(((statsByStatus.won?.count || 0) / closedLeads) * 100)
        : 0;

      const conversionRate = totalLeads > 0
        ? Math.round(((statsByStatus.won?.count || 0) / totalLeads) * 100)
        : 0;

      res.json({
        by_status: statsByStatus,
        total_leads: totalLeads,
        active_leads: activeLeads,
        closed_leads: closedLeads,
        win_rate: winRate,
        conversion_rate: conversionRate
      });
    });
  }
};

module.exports = leadController;