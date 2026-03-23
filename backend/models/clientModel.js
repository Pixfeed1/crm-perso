// backend/models/clientModel.js
// Converti en PostgreSQL natif ($1, $2, etc.)


/**
 * Recupere tous les clients avec leur statut de lead d'origine
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
        reject(err);
      } else {
        resolve(clients || []);
      }
    });
  });
};

/**
 * Recupere un client par son ID avec ses projets et revenus
 */
const getClientById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM crm_clients WHERE id = $1`, [id], (err, client) => {
      if (err) {
        return reject(err);
      }

      if (!client) {
        return resolve(null);
      }

      if (client.lead_id) {
        db.all('SELECT * FROM projects WHERE lead_id = $1 ORDER BY name', [client.lead_id], (projectErr, projects) => {
          client.projects = projectErr ? [] : (projects || []);

          db.all('SELECT * FROM revenues WHERE lead_id = $1 ORDER BY date DESC', [client.lead_id], (revenueErr, revenues) => {
            client.revenues = revenueErr ? [] : (revenues || []);
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
 * Cree un nouveau client
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.get(
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
      function(err, result) {
        if (err) {
          reject(err);
        } else {
          const newId = result?.id || this.lastID;
          db.get(`SELECT * FROM crm_clients WHERE id = $1`, [newId], (err, client) => {
            if (err) {
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
    db.get('SELECT * FROM leads WHERE id = $1', [leadId], (err, lead) => {
      if (err) {
        return reject(err);
      }

      if (!lead) {
        return reject(new Error('Lead non trouve'));
      }

      db.get('SELECT id FROM crm_clients WHERE lead_id = $1', [leadId], (err, existingClient) => {
        if (err) {
          return reject(err);
        }

        if (existingClient) {
          return reject(new Error('Ce lead a deja ete converti en client'));
        }

        db.get('SELECT email, phone FROM contacts WHERE lead_id = $1 LIMIT 1', [leadId], (err, contact) => {
          const email = lead.email || (contact ? contact.email : null);
          const phone = lead.phone || (contact ? contact.phone : null);

          const now = new Date().toISOString();

          const query = `
            INSERT INTO crm_clients (
              lead_id, name, company, type, email, phone,
              source, contract_start_date, lifetime_value,
              notes, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $12)
            RETURNING id
          `;

          db.get(
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
            function(err, result) {
              if (err) {
                return reject(err);
              }

              const newClientId = result?.id || this.lastID;

              db.run('UPDATE projects SET client_id = $1, lead_id = NULL WHERE lead_id = $2', [newClientId, leadId], () => {
                db.run('UPDATE leads SET status = $1, updated_at = $2 WHERE id = $3', ['won', now, leadId], () => {
                  db.get(`SELECT * FROM crm_clients WHERE id = $1`, [newClientId], (err, client) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve(client);
                    }
                  });
                });
              });
            }
          );
        });
      });
    });
  });
};

/**
 * Met a jour un client (requete dynamique)
 */
const updateClient = (db, id, clientData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (clientData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(clientData.name);
    }
    if (clientData.company !== undefined) {
      fields.push(`company = $${paramIndex++}`);
      values.push(clientData.company);
    }
    if (clientData.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(clientData.type);
    }
    if (clientData.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(clientData.email);
    }
    if (clientData.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(clientData.phone);
    }
    if (clientData.address !== undefined) {
      fields.push(`address = $${paramIndex++}`);
      values.push(clientData.address);
    }
    if (clientData.website !== undefined) {
      fields.push(`website = $${paramIndex++}`);
      values.push(clientData.website);
    }
    if (clientData.industry !== undefined) {
      fields.push(`industry = $${paramIndex++}`);
      values.push(clientData.industry);
    }
    if (clientData.source !== undefined) {
      fields.push(`source = $${paramIndex++}`);
      values.push(clientData.source);
    }
    if (clientData.contract_start_date !== undefined) {
      fields.push(`contract_start_date = $${paramIndex++}`);
      values.push(clientData.contract_start_date);
    }
    if (clientData.lifetime_value !== undefined) {
      fields.push(`lifetime_value = $${paramIndex++}`);
      values.push(clientData.lifetime_value);
    }
    if (clientData.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(clientData.notes);
    }
    if (clientData.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      values.push(clientData.tags);
    }
    if (clientData.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(clientData.status);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ a mettre a jour'));
    }

    fields.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());

    values.push(id);

    const query = `UPDATE crm_clients SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id`;

    db.run(query, values, function(err) {
      if (err) {
        reject(err);
      } else {
        db.get(`SELECT * FROM crm_clients WHERE id = $1`, [id], (err, client) => {
          if (err) {
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
    db.run('DELETE FROM crm_clients WHERE id = $1', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Recupere les statistiques des clients
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
        return reject(err);
      }

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
 * Verifie si un client existe
 */
const checkClientExists = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM crm_clients WHERE id = $1`, [id], (err, client) => {
      if (err) {
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
