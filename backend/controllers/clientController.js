// backend/controllers/clientController.js

/**
 * Contrôleur pour la gestion des clients (leads convertis)
 */
const clientController = {
  /**
   * Récupérer tous les clients
   */
  getAllClients: (req, res) => {
    const db = req.app.locals.db;

    const query = `
      SELECT
        c.*,
        l.status as original_lead_status
      FROM crm_clients c
      LEFT JOIN leads l ON c.lead_id = l.id
      ORDER BY c.name ASC
    `;

    db.all(query, [], (err, clients) => {
      if (err) {
        console.error('Erreur lors de la récupération des clients:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      res.json(clients);
    });
  },

  /**
   * Récupérer un client spécifique avec ses projets et revenus associés
   */
  getClientById: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    db.get('SELECT * FROM crm_clients WHERE id = ?', [id], (err, client) => {
      if (err) {
        console.error('Erreur lors de la récupération du client:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      if (!client) {
        return res.status(404).json({ message: 'Client non trouvé' });
      }

      // Récupérer les projets associés au client via lead_id
      if (client.lead_id) {
        db.all('SELECT * FROM projects WHERE lead_id = ? ORDER BY name', [client.lead_id], (projectErr, projects) => {
          if (projectErr) {
            console.error('Erreur lors de la récupération des projets:', projectErr);
            return res.json(client);
          }

          client.projects = projects || [];

          // Récupérer les revenus associés au client
          db.all('SELECT * FROM revenues WHERE lead_id = ? ORDER BY date DESC', [client.lead_id], (revenueErr, revenues) => {
            if (revenueErr) {
              console.error('Erreur lors de la récupération des revenus:', revenueErr);
              return res.json(client);
            }

            client.revenues = revenues || [];
            res.json(client);
          });
        });
      } else {
        client.projects = [];
        client.revenues = [];
        res.json(client);
      }
    });
  },

  /**
   * Créer un nouveau client
   */
  createClient: (req, res) => {
    const db = req.app.locals.db;
    const {
      lead_id, name, company, type, email, phone, address,
      website, industry, source, contract_start_date,
      lifetime_value, notes, tags, status
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Le nom est requis' });
    }

    const query = `
      INSERT INTO crm_clients (
        lead_id, name, company, type, email, phone, address,
        website, industry, source, contract_start_date,
        lifetime_value, notes, tags, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(query, [
      lead_id || null,
      name,
      company || null,
      type || 'individual',
      email || null,
      phone || null,
      address || null,
      website || null,
      industry || null,
      source || null,
      contract_start_date || null,
      lifetime_value || 0,
      notes || null,
      tags || null,
      status || 'active',
      now,
      now
    ], function(err) {
      if (err) {
        console.error('Erreur lors de la création du client:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      const newClientId = this.lastID;

      // Récupérer le client créé
      db.get('SELECT * FROM crm_clients WHERE id = ?', [newClientId], (err, client) => {
        if (err) {
          console.error('Erreur lors de la récupération du nouveau client:', err);
          return res.status(201).json({ id: newClientId, message: 'Client créé' });
        }

        res.status(201).json(client);
      });
    });
  },

  /**
   * Convertir un lead en client
   */
  convertFromLead: (req, res) => {
    const db = req.app.locals.db;
    const { leadId } = req.params;
    const { contract_start_date, lifetime_value, notes } = req.body;

    // Récupérer les informations du lead
    db.get('SELECT * FROM leads WHERE id = ?', [leadId], (err, lead) => {
      if (err) {
        console.error('Erreur lors de la récupération du lead:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      if (!lead) {
        return res.status(404).json({ message: 'Lead non trouvé' });
      }

      // Vérifier si le lead n'est pas déjà converti
      db.get('SELECT id FROM crm_clients WHERE lead_id = ?', [leadId], (err, existingClient) => {
        if (err) {
          console.error('Erreur lors de la vérification du client:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }

        if (existingClient) {
          return res.status(400).json({
            message: 'Ce lead a déjà été converti en client',
            clientId: existingClient.id
          });
        }

        // Créer le client à partir du lead
        const query = `
          INSERT INTO crm_clients (
            lead_id, name, company, type, email, phone,
            source, contract_start_date, lifetime_value,
            notes, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `;

        const now = new Date().toISOString();

        // Récupérer l'email et le téléphone du lead (ou des contacts)
        db.get('SELECT email, phone FROM contacts WHERE lead_id = ? LIMIT 1', [leadId], (err, contact) => {
          const email = lead.email || (contact ? contact.email : null);
          const phone = lead.phone || (contact ? contact.phone : null);

          db.run(query, [
            leadId,
            lead.name,
            lead.company || null,
            lead.type || 'individual',
            email,
            phone,
            lead.source || null,
            contract_start_date || now,
            lifetime_value || 0,
            notes || lead.notes || null,
            now,
            now
          ], function(err) {
            if (err) {
              console.error('Erreur lors de la conversion du lead en client:', err);
              return res.status(500).json({ message: 'Erreur serveur' });
            }

            const newClientId = this.lastID;

            // Mettre à jour le statut du lead en 'won'
            db.run('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?',
              ['won', now, leadId], (err) => {
                if (err) {
                  console.warn('Erreur lors de la mise à jour du statut du lead:', err);
                  // On continue quand même
                }

                // Récupérer le client créé
                db.get('SELECT * FROM crm_clients WHERE id = ?', [newClientId], (err, client) => {
                  if (err) {
                    console.error('Erreur lors de la récupération du nouveau client:', err);
                    return res.status(201).json({
                      id: newClientId,
                      message: 'Client créé à partir du lead'
                    });
                  }

                  res.status(201).json({
                    message: 'Lead converti en client avec succès',
                    client
                  });
                });
              }
            );
          });
        });
      });
    });
  },

  /**
   * Mettre à jour un client existant
   */
  updateClient: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      name, company, type, email, phone, address,
      website, industry, source, contract_start_date,
      lifetime_value, notes, tags, status
    } = req.body;

    // Vérifier si le client existe
    db.get('SELECT * FROM crm_clients WHERE id = ?', [id], (err, client) => {
      if (err) {
        console.error('Erreur lors de la vérification du client:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      if (!client) {
        return res.status(404).json({ message: 'Client non trouvé' });
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

      if (email !== undefined) {
        updates.push('email = ?');
        params.push(email);
      }

      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone);
      }

      if (address !== undefined) {
        updates.push('address = ?');
        params.push(address);
      }

      if (website !== undefined) {
        updates.push('website = ?');
        params.push(website);
      }

      if (industry !== undefined) {
        updates.push('industry = ?');
        params.push(industry);
      }

      if (source !== undefined) {
        updates.push('source = ?');
        params.push(source);
      }

      if (contract_start_date !== undefined) {
        updates.push('contract_start_date = ?');
        params.push(contract_start_date);
      }

      if (lifetime_value !== undefined) {
        updates.push('lifetime_value = ?');
        params.push(lifetime_value);
      }

      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }

      if (tags !== undefined) {
        updates.push('tags = ?');
        params.push(tags);
      }

      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }

      // Ajouter updated_at
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());

      // Ajouter l'ID à la fin
      params.push(id);

      if (updates.length === 1) {
        // Seulement updated_at, rien à mettre à jour
        return res.json(client);
      }

      const query = `UPDATE crm_clients SET ${updates.join(', ')} WHERE id = ?`;

      db.run(query, params, (err) => {
        if (err) {
          console.error('Erreur lors de la mise à jour du client:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }

        // Récupérer le client mis à jour
        db.get('SELECT * FROM crm_clients WHERE id = ?', [id], (err, updatedClient) => {
          if (err) {
            console.error('Erreur lors de la récupération du client mis à jour:', err);
            return res.json({ message: 'Client mis à jour' });
          }

          res.json(updatedClient);
        });
      });
    });
  },

  /**
   * Supprimer un client
   */
  deleteClient: (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Vérifier si le client existe
    db.get('SELECT * FROM crm_clients WHERE id = ?', [id], (err, client) => {
      if (err) {
        console.error('Erreur lors de la vérification du client:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      if (!client) {
        return res.status(404).json({ message: 'Client non trouvé' });
      }

      // Supprimer le client
      db.run('DELETE FROM crm_clients WHERE id = ?', [id], (err) => {
        if (err) {
          console.error('Erreur lors de la suppression du client:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }

        res.json({ message: 'Client supprimé avec succès' });
      });
    });
  },

  /**
   * Récupérer les statistiques des clients
   */
  getClientStats: (req, res) => {
    const db = req.app.locals.db;

    const statsQuery = `
      SELECT
        COUNT(*) as total_clients,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_clients,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_clients,
        SUM(lifetime_value) as total_lifetime_value,
        AVG(lifetime_value) as avg_lifetime_value
      FROM crm_clients
    `;

    db.get(statsQuery, [], (err, stats) => {
      if (err) {
        console.error('Erreur lors de la récupération des statistiques:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      // Statistiques par type
      const typeQuery = `
        SELECT
          type,
          COUNT(*) as count,
          SUM(lifetime_value) as total_value
        FROM crm_clients
        GROUP BY type
      `;

      db.all(typeQuery, [], (err, typeStats) => {
        if (err) {
          console.error('Erreur lors de la récupération des stats par type:', err);
          return res.json(stats);
        }

        res.json({
          ...stats,
          by_type: typeStats
        });
      });
    });
  }
};

module.exports = clientController;
