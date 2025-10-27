// backend/models/clientModel.js

/**
 * Récupère tous les clients avec leur statut de lead d'origine
 */
const getAllClients = (db) => {
  return new Promise((resolve, reject) => {
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
        console.error('[ClientModel] Erreur lors de la récupération des clients:', err);
        reject(err);
      } else {
        resolve(clients || []);
      }
    });
  });
};

/**
 * Récupère un client par son ID avec ses projets et revenus
 */
const getClientById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM crm_clients WHERE id = ?', [id], (err, client) => {
      if (err) {
        console.error('[ClientModel] Erreur lors de la récupération du client:', err);
        return reject(err);
      }

      if (!client) {
        return resolve(null);
      }

      // Si le client a un lead_id, récupérer les projets et revenus associés
      if (client.lead_id) {
        // Récupérer les projets
        db.all('SELECT * FROM projects WHERE lead_id = ? ORDER BY name', [client.lead_id], (projectErr, projects) => {
          if (projectErr) {
            console.error('[ClientModel] Erreur lors de la récupération des projets:', projectErr);
            client.projects = [];
          } else {
            client.projects = projects || [];
          }

          // Récupérer les revenus
          db.all('SELECT * FROM revenues WHERE lead_id = ? ORDER BY date DESC', [client.lead_id], (revenueErr, revenues) => {
            if (revenueErr) {
              console.error('[ClientModel] Erreur lors de la récupération des revenus:', revenueErr);
              client.revenues = [];
            } else {
              client.revenues = revenues || [];
            }

            resolve(client);
          });
        });
      } else {
        client.projects = [];
        client.revenues = [];
        resolve(client);
      }
    });
  });
};

/**
 * Crée un nouveau client
 */
const createClient = (db, clientData) => {
  return new Promise((resolve, reject) => {
    const {
      lead_id,
      name,
      company,
      type = 'individual',
      email,
      phone,
      address,
      website,
      industry,
      source,
      contract_start_date,
      lifetime_value = 0,
      notes,
      tags,
      status = 'active'
    } = clientData;

    if (!name) {
      return reject(new Error('Le nom est requis'));
    }

    const query = `
      INSERT INTO crm_clients (
        lead_id, name, company, type, email, phone, address,
        website, industry, source, contract_start_date,
        lifetime_value, notes, tags, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [
        lead_id || null,
        name,
        company || null,
        type,
        email || null,
        phone || null,
        address || null,
        website || null,
        industry || null,
        source || null,
        contract_start_date || null,
        lifetime_value,
        notes || null,
        tags || null,
        status,
        now,
        now
      ],
      function(err) {
        if (err) {
          console.error('[ClientModel] Erreur lors de la création du client:', err);
          reject(err);
        } else {
          db.get('SELECT * FROM crm_clients WHERE id = ?', [this.lastID], (err, client) => {
            if (err) {
              console.error('[ClientModel] Erreur lors de la récupération du client créé:', err);
              reject(err);
            } else {
              resolve(client);
            }
          });
        }
      }
    );
  });
};

/**
 * Convertit un lead en client
 */
const convertFromLead = (db, leadId, conversionData = {}) => {
  return new Promise((resolve, reject) => {
    // Récupérer les informations du lead
    db.get('SELECT * FROM leads WHERE id = ?', [leadId], (err, lead) => {
      if (err) {
        console.error('[ClientModel] Erreur lors de la récupération du lead:', err);
        return reject(err);
      }

      if (!lead) {
        return reject(new Error('Lead non trouvé'));
      }

      // Vérifier si le lead n'est pas déjà converti
      db.get('SELECT id FROM crm_clients WHERE lead_id = ?', [leadId], (err, existingClient) => {
        if (err) {
          console.error('[ClientModel] Erreur lors de la vérification du client:', err);
          return reject(err);
        }

        if (existingClient) {
          return reject(new Error('Ce lead a déjà été converti en client'));
        }

        // Récupérer l'email et le téléphone du lead (ou des contacts)
        db.get('SELECT email, phone FROM contacts WHERE lead_id = ? LIMIT 1', [leadId], (err, contact) => {
          const email = lead.email || (contact ? contact.email : null);
          const phone = lead.phone || (contact ? contact.phone : null);

          const now = new Date().toISOString();

          const query = `
            INSERT INTO crm_clients (
              lead_id, name, company, type, email, phone,
              source, contract_start_date, lifetime_value,
              notes, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
          `;

          db.run(
            query,
            [
              leadId,
              lead.name,
              lead.company || null,
              lead.type || 'individual',
              email,
              phone,
              lead.source || null,
              conversionData.contract_start_date || now,
              conversionData.lifetime_value || 0,
              conversionData.notes || lead.notes || null,
              now,
              now
            ],
            function(err) {
              if (err) {
                console.error('[ClientModel] Erreur lors de la conversion du lead en client:', err);
                return reject(err);
              }

              const newClientId = this.lastID;

              // Mettre à jour le statut du lead en 'won'
              db.run(
                'UPDATE leads SET status = ?, updated_at = ? WHERE id = ?',
                ['won', now, leadId],
                (err) => {
                  if (err) {
                    console.warn('[ClientModel] Erreur lors de la mise à jour du statut du lead:', err);
                    // Continuer quand même
                  }

                  // Récupérer le client créé
                  db.get('SELECT * FROM crm_clients WHERE id = ?', [newClientId], (err, client) => {
                    if (err) {
                      console.error('[ClientModel] Erreur lors de la récupération du client créé:', err);
                      reject(err);
                    } else {
                      resolve(client);
                    }
                  });
                }
              );
            }
          );
        });
      });
    });
  });
};

/**
 * Met à jour un client
 */
const updateClient = (db, id, clientData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (clientData.name !== undefined) {
      fields.push('name = ?');
      values.push(clientData.name);
    }
    if (clientData.company !== undefined) {
      fields.push('company = ?');
      values.push(clientData.company);
    }
    if (clientData.type !== undefined) {
      fields.push('type = ?');
      values.push(clientData.type);
    }
    if (clientData.email !== undefined) {
      fields.push('email = ?');
      values.push(clientData.email);
    }
    if (clientData.phone !== undefined) {
      fields.push('phone = ?');
      values.push(clientData.phone);
    }
    if (clientData.address !== undefined) {
      fields.push('address = ?');
      values.push(clientData.address);
    }
    if (clientData.website !== undefined) {
      fields.push('website = ?');
      values.push(clientData.website);
    }
    if (clientData.industry !== undefined) {
      fields.push('industry = ?');
      values.push(clientData.industry);
    }
    if (clientData.source !== undefined) {
      fields.push('source = ?');
      values.push(clientData.source);
    }
    if (clientData.contract_start_date !== undefined) {
      fields.push('contract_start_date = ?');
      values.push(clientData.contract_start_date);
    }
    if (clientData.lifetime_value !== undefined) {
      fields.push('lifetime_value = ?');
      values.push(clientData.lifetime_value);
    }
    if (clientData.notes !== undefined) {
      fields.push('notes = ?');
      values.push(clientData.notes);
    }
    if (clientData.tags !== undefined) {
      fields.push('tags = ?');
      values.push(clientData.tags);
    }
    if (clientData.status !== undefined) {
      fields.push('status = ?');
      values.push(clientData.status);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Ajouter la date de mise à jour
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    // Ajouter l'ID pour la clause WHERE
    values.push(id);

    const query = `UPDATE crm_clients SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[ClientModel] Erreur lors de la mise à jour du client:', err);
        reject(err);
      } else {
        db.get('SELECT * FROM crm_clients WHERE id = ?', [id], (err, client) => {
          if (err) {
            console.error('[ClientModel] Erreur lors de la récupération du client mis à jour:', err);
            reject(err);
          } else {
            resolve(client);
          }
        });
      }
    });
  });
};

/**
 * Supprime un client
 */
const deleteClient = (db, id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM crm_clients WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('[ClientModel] Erreur lors de la suppression du client:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Récupère les statistiques des clients
 */
const getClientStats = (db) => {
  return new Promise((resolve, reject) => {
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
        console.error('[ClientModel] Erreur lors de la récupération des statistiques:', err);
        return reject(err);
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
          console.error('[ClientModel] Erreur lors de la récupération des stats par type:', err);
          return resolve(stats);
        }

        resolve({
          ...stats,
          by_type: typeStats
        });
      });
    });
  });
};

/**
 * Vérifie si un client existe
 */
const checkClientExists = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM crm_clients WHERE id = ?', [id], (err, client) => {
      if (err) {
        console.error('[ClientModel] Erreur lors de la vérification du client:', err);
        reject(err);
      } else {
        resolve(client);
      }
    });
  });
};

module.exports = {
  getAllClients,
  getClientById,
  createClient,
  convertFromLead,
  updateClient,
  deleteClient,
  getClientStats,
  checkClientExists
};
