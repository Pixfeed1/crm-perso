// backend/models/leadModel.js

/**
 * Récupère tous les leads
 */
const getAllLeads = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT *
      FROM leads
      ORDER BY name ASC
    `;

    db.all(query, [], (err, leads) => {
      if (err) {
        console.error('[LeadModel] Erreur lors de la récupération des leads:', err);
        reject(err);
      } else {
        resolve(leads || []);
      }
    });
  });
};

/**
 * Récupère un lead par son ID avec ses contacts et projets
 */
const getLeadById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('[LeadModel] Erreur lors de la récupération du lead:', err);
        return reject(err);
      }

      if (!lead) {
        return resolve(null);
      }

      // Récupérer les contacts associés avec leurs informations de client
      const contactsQuery = `
        SELECT
          c.*,
          cl.id as client_id,
          cl.name as client_name,
          cl.status as client_status,
          cl.type as client_type
        FROM contacts c
        LEFT JOIN crm_clients cl ON c.client_id = cl.id
        WHERE c.lead_id = ?
        ORDER BY c.name
      `;

      db.all(contactsQuery, [id], (contactErr, contacts) => {
        if (contactErr) {
          console.error('[LeadModel] Erreur lors de la récupération des contacts:', contactErr);
          lead.contacts = [];
        } else {
          lead.contacts = contacts || [];
        }

        // Récupérer les projets associés
        db.all('SELECT * FROM projects WHERE lead_id = ? ORDER BY name', [id], (projectErr, projects) => {
          if (projectErr) {
            console.error('[LeadModel] Erreur lors de la récupération des projets:', projectErr);
            lead.projects = [];
          } else {
            lead.projects = projects || [];
          }

          resolve(lead);
        });
      });
    });
  });
};

/**
 * Crée un nouveau lead
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [name, company || null, type, status, source || null, notes || null, now, now],
      function(err) {
        if (err) {
          console.error('[LeadModel] Erreur lors de la création du lead:', err);
          reject(err);
        } else {
          getLeadById(db, this.lastID)
            .then(lead => resolve(lead))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met à jour un lead
 */
const updateLead = (db, id, leadData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (leadData.name !== undefined) {
      fields.push('name = ?');
      values.push(leadData.name);
    }
    if (leadData.company !== undefined) {
      fields.push('company = ?');
      values.push(leadData.company);
    }
    if (leadData.type !== undefined) {
      fields.push('type = ?');
      values.push(leadData.type);
    }
    if (leadData.status !== undefined) {
      fields.push('status = ?');
      values.push(leadData.status);
    }
    if (leadData.source !== undefined) {
      fields.push('source = ?');
      values.push(leadData.source);
    }
    if (leadData.notes !== undefined) {
      fields.push('notes = ?');
      values.push(leadData.notes);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Ajouter la date de mise à jour
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    // Ajouter l'ID pour la clause WHERE
    values.push(id);

    const query = `UPDATE leads SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[LeadModel] Erreur lors de la mise à jour du lead:', err);
        reject(err);
      } else {
        // Récupérer juste le lead sans les relations pour la mise à jour simple
        db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
          if (err) {
            console.error('[LeadModel] Erreur lors de la récupération du lead mis à jour:', err);
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
    db.run('DELETE FROM leads WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('[LeadModel] Erreur lors de la suppression du lead:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Récupère tous les contacts d'un lead avec leurs informations de client si liés
 */
const getLeadContacts = (db, leadId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        c.*,
        cl.id as client_id,
        cl.name as client_name,
        cl.status as client_status,
        cl.type as client_type
      FROM contacts c
      LEFT JOIN crm_clients cl ON c.client_id = cl.id
      WHERE c.lead_id = ?
      ORDER BY c.name
    `;

    db.all(query, [leadId], (err, contacts) => {
      if (err) {
        console.error('[LeadModel] Erreur lors de la récupération des contacts:', err);
        reject(err);
      } else {
        resolve(contacts || []);
      }
    });
  });
};

/**
 * Crée un nouveau contact pour un lead
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

    // Si le contact est principal, mettre à jour les autres contacts
    const handlePrimary = () => {
      return new Promise((resolvePrimary) => {
        if (is_primary) {
          db.run(
            'UPDATE contacts SET is_primary = 0 WHERE lead_id = ?',
            [leadId],
            (err) => {
              if (err) {
                console.error('[LeadModel] Erreur lors de la mise à jour des contacts principaux:', err);
              }
              resolvePrimary();
            }
          );
        } else {
          resolvePrimary();
        }
      });
    };

    handlePrimary().then(() => {
      const query = `
        INSERT INTO contacts (
          lead_id, name, position, email, phone, is_primary, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const now = new Date().toISOString();

      db.run(
        query,
        [leadId, name, position || null, email || null, phone || null, is_primary ? 1 : 0, notes || null, now],
        function(err) {
          if (err) {
            console.error('[LeadModel] Erreur lors de la création du contact:', err);
            reject(err);
          } else {
            db.get('SELECT * FROM contacts WHERE id = ?', [this.lastID], (err, contact) => {
              if (err) {
                console.error('[LeadModel] Erreur lors de la récupération du contact créé:', err);
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
 * Met à jour un contact
 */
const updateContact = (db, contactId, leadId, contactData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (contactData.name !== undefined) {
      fields.push('name = ?');
      values.push(contactData.name);
    }
    if (contactData.position !== undefined) {
      fields.push('position = ?');
      values.push(contactData.position);
    }
    if (contactData.email !== undefined) {
      fields.push('email = ?');
      values.push(contactData.email);
    }
    if (contactData.phone !== undefined) {
      fields.push('phone = ?');
      values.push(contactData.phone);
    }
    if (contactData.is_primary !== undefined) {
      fields.push('is_primary = ?');
      values.push(contactData.is_primary ? 1 : 0);
    }
    if (contactData.notes !== undefined) {
      fields.push('notes = ?');
      values.push(contactData.notes);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Si le contact devient principal, mettre à jour les autres contacts
    const handlePrimary = () => {
      return new Promise((resolvePrimary) => {
        if (contactData.is_primary) {
          db.run(
            'UPDATE contacts SET is_primary = 0 WHERE lead_id = ? AND id != ?',
            [leadId, contactId],
            (err) => {
              if (err) {
                console.error('[LeadModel] Erreur lors de la mise à jour des contacts principaux:', err);
              }
              resolvePrimary();
            }
          );
        } else {
          resolvePrimary();
        }
      });
    };

    handlePrimary().then(() => {
      // Ajouter les IDs pour la clause WHERE
      values.push(contactId);
      values.push(leadId);

      const query = `
        UPDATE contacts
        SET ${fields.join(', ')}
        WHERE id = ? AND lead_id = ?
      `;

      db.run(query, values, function(err) {
        if (err) {
          console.error('[LeadModel] Erreur lors de la mise à jour du contact:', err);
          reject(err);
        } else {
          db.get('SELECT * FROM contacts WHERE id = ?', [contactId], (err, contact) => {
            if (err) {
              console.error('[LeadModel] Erreur lors de la récupération du contact mis à jour:', err);
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
    db.run(
      'DELETE FROM contacts WHERE id = ? AND lead_id = ?',
      [contactId, leadId],
      function(err) {
        if (err) {
          console.error('[LeadModel] Erreur lors de la suppression du contact:', err);
          reject(err);
        } else {
          resolve({ success: true, changes: this.changes });
        }
      }
    );
  });
};

/**
 * Vérifie si un contact existe et appartient au lead
 */
const checkContactExists = (db, contactId, leadId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM contacts WHERE id = ? AND lead_id = ?',
      [contactId, leadId],
      (err, contact) => {
        if (err) {
          console.error('[LeadModel] Erreur lors de la vérification du contact:', err);
          reject(err);
        } else {
          resolve(contact);
        }
      }
    );
  });
};

/**
 * Récupère les statistiques Kanban (nombre de leads par statut + taux de conversion)
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
        console.error('[LeadModel] Erreur lors de la récupération des statistiques Kanban:', err);
        return reject(err);
      }

      // Créer un objet avec les statistiques par statut
      const statsByStatus = {
        new: { count: 0, total_budget: 0 },
        contacted: { count: 0, total_budget: 0 },
        proposal: { count: 0, total_budget: 0 },
        negotiation: { count: 0, total_budget: 0 },
        won: { count: 0, total_budget: 0 },
        lost: { count: 0, total_budget: 0 }
      };

      // Remplir avec les données de la base
      stats.forEach(stat => {
        if (statsByStatus[stat.status]) {
          statsByStatus[stat.status] = {
            count: stat.count,
            total_budget: stat.total_budget
          };
        }
      });

      // Calculer les totaux
      const totalLeads = stats.reduce((sum, stat) => sum + stat.count, 0);
      const totalBudget = stats.reduce((sum, stat) => sum + stat.total_budget, 0);

      // Calculer les taux de conversion
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
 * Lie un contact existant à un client existant
 * Permet à un contact (personne dans une entreprise) d'avoir aussi un profil client particulier
 */
const linkContactToClient = (db, contactId, clientId) => {
  return new Promise((resolve, reject) => {
    // Vérifier que le client existe
    db.get('SELECT * FROM crm_clients WHERE id = ?', [clientId], (err, client) => {
      if (err) {
        console.error('[LeadModel] Erreur lors de la vérification du client:', err);
        return reject(err);
      }

      if (!client) {
        return reject(new Error('Client introuvable'));
      }

      // Mettre à jour le contact
      db.run(
        'UPDATE contacts SET client_id = ? WHERE id = ?',
        [clientId, contactId],
        function(err) {
          if (err) {
            console.error('[LeadModel] Erreur lors de la liaison contact-client:', err);
            reject(err);
          } else {
            // Récupérer le contact mis à jour avec les infos du client
            db.get(
              `SELECT c.*, cl.name as client_name, cl.status as client_status
               FROM contacts c
               LEFT JOIN crm_clients cl ON c.client_id = cl.id
               WHERE c.id = ?`,
              [contactId],
              (err, contact) => {
                if (err) {
                  console.error('[LeadModel] Erreur lors de la récupération du contact:', err);
                  reject(err);
                } else {
                  resolve(contact);
                }
              }
            );
          }
        }
      );
    });
  });
};

/**
 * Crée un nouveau client à partir d'un contact existant
 * Pré-remplit les informations du client avec celles du contact
 */
const createClientFromContact = (db, contactId, additionalData = {}) => {
  return new Promise((resolve, reject) => {
    // Récupérer le contact
    db.get('SELECT * FROM contacts WHERE id = ?', [contactId], (err, contact) => {
      if (err) {
        console.error('[LeadModel] Erreur lors de la récupération du contact:', err);
        return reject(err);
      }

      if (!contact) {
        return reject(new Error('Contact introuvable'));
      }

      // Créer le client avec les données du contact
      const now = new Date().toISOString();
      const query = `
        INSERT INTO crm_clients (
          name, email, phone, type, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const clientData = {
        name: additionalData.name || contact.name,
        email: additionalData.email || contact.email,
        phone: additionalData.phone || contact.phone,
        type: 'individual', // Un contact devient toujours un client particulier
        status: 'active',
        notes: additionalData.notes || `Créé depuis le contact: ${contact.name}${contact.position ? ' (' + contact.position + ')' : ''}`
      };

      db.run(
        query,
        [clientData.name, clientData.email, clientData.phone, clientData.type, clientData.status, clientData.notes, now, now],
        function(err) {
          if (err) {
            console.error('[LeadModel] Erreur lors de la création du client:', err);
            return reject(err);
          }

          const newClientId = this.lastID;

          // Lier le contact au nouveau client
          db.run(
            'UPDATE contacts SET client_id = ? WHERE id = ?',
            [newClientId, contactId],
            (err) => {
              if (err) {
                console.error('[LeadModel] Erreur lors de la liaison contact-client:', err);
                return reject(err);
              }

              // Récupérer le client créé avec le contact lié
              db.get(
                `SELECT c.*, cl.name as client_name, cl.status as client_status
                 FROM contacts c
                 LEFT JOIN crm_clients cl ON c.client_id = cl.id
                 WHERE c.id = ?`,
                [contactId],
                (err, updatedContact) => {
                  if (err) {
                    console.error('[LeadModel] Erreur lors de la récupération du contact:', err);
                    reject(err);
                  } else {
                    resolve({
                      contact: updatedContact,
                      client_id: newClientId
                    });
                  }
                }
              );
            }
          );
        }
      );
    });
  });
};

/**
 * Délie un contact de son client
 */
const unlinkContactFromClient = (db, contactId) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE contacts SET client_id = NULL WHERE id = ?',
      [contactId],
      function(err) {
        if (err) {
          console.error('[LeadModel] Erreur lors du déliaison contact-client:', err);
          reject(err);
        } else {
          db.get('SELECT * FROM contacts WHERE id = ?', [contactId], (err, contact) => {
            if (err) {
              console.error('[LeadModel] Erreur lors de la récupération du contact:', err);
              reject(err);
            } else {
              resolve(contact);
            }
          });
        }
      }
    );
  });
};

/**
 * Récupère un contact avec les informations de son client associé
 */
const getContactWithClient = (db, contactId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        c.*,
        cl.id as client_id,
        cl.name as client_name,
        cl.email as client_email,
        cl.phone as client_phone,
        cl.status as client_status,
        cl.lifetime_value as client_lifetime_value
      FROM contacts c
      LEFT JOIN crm_clients cl ON c.client_id = cl.id
      WHERE c.id = ?
    `;

    db.get(query, [contactId], (err, contact) => {
      if (err) {
        console.error('[LeadModel] Erreur lors de la récupération du contact avec client:', err);
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
