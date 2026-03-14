// backend/models/leadModel.js
// Converti en PostgreSQL natif ($1, $2, etc.)

/**
 * Recupere tous les leads
 */
const getAllLeads = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT id, name, company, type, status, source, notes, budget, created_at, updated_at
      FROM leads
      ORDER BY name ASC
    `;

    db.all(query, [], (err, leads) => {
      if (err) {
        reject(err);
      } else {
        resolve(leads || []);
      }
    });
  });
};

/**
 * Recupere un lead par son ID avec ses contacts et projets
 */
const getLeadById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, name, company, type, status, source, notes, budget, created_at, updated_at FROM leads WHERE id = $1', [id], (err, lead) => {
      if (err) {
        return reject(err);
      }

      if (!lead) {
        return resolve(null);
      }

      const contactsQuery = `
        SELECT
          c.id, c.lead_id, c.client_id, c.name, c.position, c.email, c.phone, c.is_primary, c.notes, c.created_at,
          cl.id as client_id,
          cl.name as client_name,
          cl.status as client_status,
          cl.type as client_type
        FROM contacts c
        LEFT JOIN crm_clients cl ON c.client_id = cl.id
        WHERE c.lead_id = $1
        ORDER BY c.name
      `;

      db.all(contactsQuery, [id], (contactErr, contacts) => {
        lead.contacts = contactErr ? [] : (contacts || []);

        db.all('SELECT id, name, lead_id, client_id, status, start_date, end_date, budget, description, created_at, updated_at FROM projects WHERE lead_id = $1 ORDER BY name', [id], (projectErr, projects) => {
          lead.projects = projectErr ? [] : (projects || []);
          resolve(lead);
        });
      });
    });
  });
};

/**
 * Cree un nouveau lead
 */
const createLead = (db, leadData) => {
  return new Promise((resolve, reject) => {
    const {
      name,
      company,
      type = 'individual',
      status,
      source,
      notes
    } = leadData;

    if (!name || !status) {
      return reject(new Error('Nom et statut sont requis'));
    }

    const query = `
      INSERT INTO leads (
        name, company, type, status, source, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const now = new Date().toISOString();

    db.get(
      query,
      [name, company || null, type, status, source || null, notes || null, now, now],
      function(err, result) {
        if (err) {
          reject(err);
        } else {
          const newId = result?.id || this.lastID;
          getLeadById(db, newId)
            .then(lead => resolve(lead))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met a jour un lead (requete dynamique)
 */
const updateLead = (db, id, leadData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (leadData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(leadData.name);
    }
    if (leadData.company !== undefined) {
      fields.push(`company = $${paramIndex++}`);
      values.push(leadData.company);
    }
    if (leadData.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(leadData.type);
    }
    if (leadData.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(leadData.status);
    }
    if (leadData.source !== undefined) {
      fields.push(`source = $${paramIndex++}`);
      values.push(leadData.source);
    }
    if (leadData.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(leadData.notes);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ a mettre a jour'));
    }

    fields.push(`updated_at = $${paramIndex++}`);
    values.push(new Date().toISOString());

    values.push(id);

    const query = `UPDATE leads SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id`;

    db.run(query, values, function(err) {
      if (err) {
        reject(err);
      } else {
        db.get('SELECT id, name, company, type, status, source, notes, budget, created_at, updated_at FROM leads WHERE id = $1', [id], (err, lead) => {
          if (err) {
            reject(err);
          } else {
            resolve(lead);
          }
        });
      }
    });
  });
};

/**
 * Supprime un lead
 */
const deleteLead = (db, id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM leads WHERE id = $1', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Recupere tous les contacts d'un lead
 */
const getLeadContacts = (db, leadId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        c.id, c.lead_id, c.client_id, c.name, c.position, c.email, c.phone, c.is_primary, c.notes, c.created_at,
        cl.id as client_id,
        cl.name as client_name,
        cl.status as client_status,
        cl.type as client_type
      FROM contacts c
      LEFT JOIN crm_clients cl ON c.client_id = cl.id
      WHERE c.lead_id = $1
      ORDER BY c.name
    `;

    db.all(query, [leadId], (err, contacts) => {
      if (err) {
        reject(err);
      } else {
        resolve(contacts || []);
      }
    });
  });
};

/**
 * Cree un nouveau contact pour un lead
 */
const createContact = (db, leadId, contactData) => {
  return new Promise((resolve, reject) => {
    const {
      name,
      position,
      email,
      phone,
      is_primary = false,
      notes
    } = contactData;

    if (!name) {
      return reject(new Error('Nom du contact requis'));
    }

    const handlePrimary = () => {
      return new Promise((resolvePrimary) => {
        if (is_primary) {
          db.run('UPDATE contacts SET is_primary = false WHERE lead_id = $1', [leadId], () => resolvePrimary());
        } else {
          resolvePrimary();
        }
      });
    };

    handlePrimary().then(() => {
      const query = `
        INSERT INTO contacts (
          lead_id, name, position, email, phone, is_primary, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const now = new Date().toISOString();

      db.get(
        query,
        [leadId, name, position || null, email || null, phone || null, is_primary ? true : false, notes || null, now],
        function(err, result) {
          if (err) {
            reject(err);
          } else {
            const newId = result?.id || this.lastID;
            db.get('SELECT id, lead_id, client_id, name, position, email, phone, is_primary, notes, created_at FROM contacts WHERE id = $1', [newId], (err, contact) => {
              if (err) {
                reject(err);
              } else {
                resolve(contact);
              }
            });
          }
        }
      );
    });
  });
};

/**
 * Met a jour un contact (requete dynamique)
 */
const updateContact = (db, contactId, leadId, contactData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (contactData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(contactData.name);
    }
    if (contactData.position !== undefined) {
      fields.push(`position = $${paramIndex++}`);
      values.push(contactData.position);
    }
    if (contactData.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(contactData.email);
    }
    if (contactData.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(contactData.phone);
    }
    if (contactData.is_primary !== undefined) {
      fields.push(`is_primary = $${paramIndex++}`);
      values.push(contactData.is_primary ? true : false);
    }
    if (contactData.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(contactData.notes);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ a mettre a jour'));
    }

    const handlePrimary = () => {
      return new Promise((resolvePrimary) => {
        if (contactData.is_primary) {
          db.run('UPDATE contacts SET is_primary = false WHERE lead_id = $1 AND id != $2', [leadId, contactId], () => resolvePrimary());
        } else {
          resolvePrimary();
        }
      });
    };

    handlePrimary().then(() => {
      values.push(contactId);
      values.push(leadId);

      const query = `
        UPDATE contacts
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex++} AND lead_id = $${paramIndex}
        RETURNING id
      `;

      db.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          db.get('SELECT id, lead_id, client_id, name, position, email, phone, is_primary, notes, created_at FROM contacts WHERE id = $1', [contactId], (err, contact) => {
            if (err) {
              reject(err);
            } else {
              resolve(contact);
            }
          });
        }
      });
    });
  });
};

/**
 * Supprime un contact
 */
const deleteContact = (db, contactId, leadId) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM contacts WHERE id = $1 AND lead_id = $2', [contactId, leadId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Verifie si un contact existe et appartient au lead
 */
const checkContactExists = (db, contactId, leadId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, lead_id, client_id, name, position, email, phone, is_primary, notes, created_at FROM contacts WHERE id = $1 AND lead_id = $2', [contactId, leadId], (err, contact) => {
      if (err) {
        reject(err);
      } else {
        resolve(contact);
      }
    });
  });
};

/**
 * Recupere les statistiques Kanban
 */
const getKanbanStats = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        status,
        COUNT(*) as count,
        SUM(CASE WHEN budget IS NOT NULL THEN budget ELSE 0 END) as total_budget
      FROM leads
      GROUP BY status
    `;

    db.all(query, [], (err, stats) => {
      if (err) {
        return reject(err);
      }

      const statsByStatus = {
        new: { count: 0, total_budget: 0 },
        contacted: { count: 0, total_budget: 0 },
        proposal: { count: 0, total_budget: 0 },
        negotiation: { count: 0, total_budget: 0 },
        won: { count: 0, total_budget: 0 },
        lost: { count: 0, total_budget: 0 }
      };

      stats.forEach(stat => {
        if (statsByStatus[stat.status]) {
          statsByStatus[stat.status] = {
            count: parseInt(stat.count),
            total_budget: parseFloat(stat.total_budget) || 0
          };
        }
      });

      const totalLeads = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const totalBudget = stats.reduce((sum, stat) => sum + (parseFloat(stat.total_budget) || 0), 0);

      const activeLeads = statsByStatus.new.count +
                          statsByStatus.contacted.count +
                          statsByStatus.proposal.count +
                          statsByStatus.negotiation.count;

      const closedLeads = statsByStatus.won.count + statsByStatus.lost.count;

      const winRate = closedLeads > 0
        ? Math.round((statsByStatus.won.count / closedLeads) * 100)
        : 0;

      const conversionRate = totalLeads > 0
        ? Math.round((statsByStatus.won.count / totalLeads) * 100)
        : 0;

      resolve({
        by_status: statsByStatus,
        totals: {
          total_leads: totalLeads,
          active_leads: activeLeads,
          closed_leads: closedLeads,
          total_budget: totalBudget,
          win_rate: winRate,
          conversion_rate: conversionRate
        }
      });
    });
  });
};

/**
 * Lie un contact existant a un client existant
 */
const linkContactToClient = (db, contactId, clientId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, name, status FROM crm_clients WHERE id = $1', [clientId], (err, client) => {
      if (err) {
        return reject(err);
      }

      if (!client) {
        return reject(new Error('Client introuvable'));
      }

      db.run('UPDATE contacts SET client_id = $1 WHERE id = $2', [clientId, contactId], function(err) {
        if (err) {
          reject(err);
        } else {
          db.get(
            `SELECT c.id, c.lead_id, c.client_id, c.name, c.position, c.email, c.phone, c.is_primary, c.notes, c.created_at,
                    cl.name as client_name, cl.status as client_status
             FROM contacts c
             LEFT JOIN crm_clients cl ON c.client_id = cl.id
             WHERE c.id = $1`,
            [contactId],
            (err, contact) => {
              if (err) {
                reject(err);
              } else {
                resolve(contact);
              }
            }
          );
        }
      });
    });
  });
};

/**
 * Cree un nouveau client a partir d'un contact existant
 */
const createClientFromContact = (db, contactId, additionalData = {}) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, lead_id, name, position, email, phone FROM contacts WHERE id = $1', [contactId], (err, contact) => {
      if (err) {
        return reject(err);
      }

      if (!contact) {
        return reject(new Error('Contact introuvable'));
      }

      const now = new Date().toISOString();
      const query = `
        INSERT INTO crm_clients (
          name, email, phone, type, status, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const clientData = {
        name: additionalData.name || contact.name,
        email: additionalData.email || contact.email,
        phone: additionalData.phone || contact.phone,
        type: 'individual',
        status: 'active',
        notes: additionalData.notes || `Cree depuis le contact: ${contact.name}${contact.position ? ' (' + contact.position + ')' : ''}`
      };

      db.get(
        query,
        [clientData.name, clientData.email, clientData.phone, clientData.type, clientData.status, clientData.notes, now, now],
        function(err, result) {
          if (err) {
            return reject(err);
          }

          const newClientId = result?.id || this.lastID;

          db.run('UPDATE contacts SET client_id = $1 WHERE id = $2', [newClientId, contactId], (err) => {
            if (err) {
              return reject(err);
            }

            db.get(
              `SELECT c.id, c.lead_id, c.client_id, c.name, c.position, c.email, c.phone,
                      cl.name as client_name, cl.status as client_status
               FROM contacts c
               LEFT JOIN crm_clients cl ON c.client_id = cl.id
               WHERE c.id = $1`,
              [contactId],
              (err, updatedContact) => {
                if (err) {
                  reject(err);
                } else {
                  resolve({
                    contact: updatedContact,
                    client_id: newClientId
                  });
                }
              }
            );
          });
        }
      );
    });
  });
};

/**
 * Delie un contact de son client
 */
const unlinkContactFromClient = (db, contactId) => {
  return new Promise((resolve, reject) => {
    db.run('UPDATE contacts SET client_id = NULL WHERE id = $1', [contactId], function(err) {
      if (err) {
        reject(err);
      } else {
        db.get('SELECT id, lead_id, client_id, name, position, email, phone, is_primary, notes, created_at FROM contacts WHERE id = $1', [contactId], (err, contact) => {
          if (err) {
            reject(err);
          } else {
            resolve(contact);
          }
        });
      }
    });
  });
};

/**
 * Recupere un contact avec les informations de son client associe
 */
const getContactWithClient = (db, contactId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        c.id, c.lead_id, c.client_id, c.name, c.position, c.email, c.phone, c.is_primary, c.notes, c.created_at,
        cl.id as client_id,
        cl.name as client_name,
        cl.email as client_email,
        cl.phone as client_phone,
        cl.status as client_status,
        cl.lifetime_value as client_lifetime_value
      FROM contacts c
      LEFT JOIN crm_clients cl ON c.client_id = cl.id
      WHERE c.id = $1
    `;

    db.get(query, [contactId], (err, contact) => {
      if (err) {
        reject(err);
      } else {
        resolve(contact);
      }
    });
  });
};

module.exports = {
  getAllLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  getLeadContacts,
  createContact,
  updateContact,
  deleteContact,
  checkContactExists,
  getKanbanStats,
  linkContactToClient,
  createClientFromContact,
  unlinkContactFromClient,
  getContactWithClient
};
