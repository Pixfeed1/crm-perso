// backend/models/leadModel.js

/**
 * Modèle pour la gestion des leads (prospects)
 */
const db = require('../config/pgConfig');

const leadModel = {
  /**
   * Récupérer tous les leads
   * @returns {Promise<Array>} Liste des leads
   */
  getAllLeads: () => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT *
        FROM leads
        ORDER BY name ASC
      `;

      db.all(query, [], (err, leads) => {
        if (err) {
          console.error('[LeadModel] Erreur lors de la récupération des leads:', err);
          reject(new Error('Erreur serveur lors de la récupération des leads: ' + err.message));
        } else {
          resolve(leads);
        }
      });
    });
  },

  /**
   * Récupérer un lead par son ID avec ses contacts et projets
   * @param {number} id - ID du lead
   * @returns {Promise<Object>} Lead avec contacts et projets
   */
  getLeadById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
        if (err) {
          console.error(`[LeadModel] Erreur lors de la récupération du lead ${id}:`, err);
          reject(new Error('Erreur serveur lors de la récupération du lead: ' + err.message));
        } else if (!lead) {
          resolve(null);
        } else {
          // Récupérer les contacts associés
          db.all('SELECT * FROM contacts WHERE lead_id = ? ORDER BY name', [id], (contactErr, contacts) => {
            if (contactErr) {
              console.error(`[LeadModel] Erreur lors de la récupération des contacts du lead ${id}:`, contactErr);
              lead.contacts = [];
            } else {
              lead.contacts = contacts || [];
            }

            // Récupérer les projets associés
            db.all('SELECT * FROM projects WHERE lead_id = ? ORDER BY name', [id], (projectErr, projects) => {
              if (projectErr) {
                console.error(`[LeadModel] Erreur lors de la récupération des projets du lead ${id}:`, projectErr);
                lead.projects = [];
              } else {
                lead.projects = projects || [];
              }

              resolve(lead);
            });
          });
        }
      });
    });
  },

  /**
   * Créer un nouveau lead
   * @param {Object} leadData - Données du lead
   * @returns {Promise<Object>} Lead créé
   */
  createLead: (leadData) => {
    return new Promise((resolve, reject) => {
      const { name, company, type, status, source, notes, email, phone } = leadData;

      if (!name || !status) {
        return reject(new Error('Nom et statut sont requis'));
      }

      const query = `
        INSERT INTO leads (
          name, company, type, status, source, notes, email, phone, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const now = new Date().toISOString();

      db.run(query, [
        name,
        company || null,
        type || 'individual',
        status,
        source || null,
        notes || null,
        email || null,
        phone || null,
        now,
        now
      ], function(err) {
        if (err) {
          console.error('[LeadModel] Erreur lors de la création du lead:', err);
          reject(new Error('Erreur serveur lors de la création du lead: ' + err.message));
        } else {
          const newLeadId = this.lastID;

          // Récupérer le lead créé
          db.get('SELECT * FROM leads WHERE id = ?', [newLeadId], (err, lead) => {
            if (err) {
              console.error('[LeadModel] Erreur lors de la récupération du lead créé:', err);
              resolve({ id: newLeadId, ...leadData });
            } else {
              resolve(lead);
            }
          });
        }
      });
    });
  },

  /**
   * Mettre à jour un lead
   * @param {number} id - ID du lead
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Lead mis à jour
   */
  updateLead: (id, updateData) => {
    return new Promise((resolve, reject) => {
      // Vérifier si le lead existe
      db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
        if (err) {
          console.error(`[LeadModel] Erreur lors de la vérification du lead ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!lead) {
          return reject(new Error('Lead non trouvé'));
        }

        // Construire la requête de mise à jour
        const updates = [];
        const params = [];

        if (updateData.name !== undefined) {
          updates.push('name = ?');
          params.push(updateData.name);
        }

        if (updateData.company !== undefined) {
          updates.push('company = ?');
          params.push(updateData.company);
        }

        if (updateData.type !== undefined) {
          updates.push('type = ?');
          params.push(updateData.type);
        }

        if (updateData.status !== undefined) {
          updates.push('status = ?');
          params.push(updateData.status);
        }

        if (updateData.source !== undefined) {
          updates.push('source = ?');
          params.push(updateData.source);
        }

        if (updateData.notes !== undefined) {
          updates.push('notes = ?');
          params.push(updateData.notes);
        }

        if (updateData.email !== undefined) {
          updates.push('email = ?');
          params.push(updateData.email);
        }

        if (updateData.phone !== undefined) {
          updates.push('phone = ?');
          params.push(updateData.phone);
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
            console.error(`[LeadModel] Erreur lors de la mise à jour du lead ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            // Récupérer le lead mis à jour
            db.get('SELECT * FROM leads WHERE id = ?', [id], (err, updatedLead) => {
              if (err) {
                console.error('[LeadModel] Erreur lors de la récupération du lead mis à jour:', err);
                resolve({ id, ...lead, ...updateData });
              } else {
                resolve(updatedLead);
              }
            });
          }
        });
      });
    });
  },

  /**
   * Supprimer un lead
   * @param {number} id - ID du lead
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteLead: (id) => {
    return new Promise((resolve, reject) => {
      // Vérifier si le lead existe
      db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
        if (err) {
          console.error(`[LeadModel] Erreur lors de la vérification du lead ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!lead) {
          return reject(new Error('Lead non trouvé'));
        }

        // Supprimer le lead (les contacts seront supprimés automatiquement grâce à ON DELETE CASCADE)
        db.run('DELETE FROM leads WHERE id = ?', [id], function(err) {
          if (err) {
            console.error(`[LeadModel] Erreur lors de la suppression du lead ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            resolve({ id, changes: this.changes });
          }
        });
      });
    });
  },

  /**
   * Récupérer les leads récents
   * @param {number} limit - Nombre de leads à récupérer
   * @returns {Promise<Array>} Liste des leads récents
   */
  getRecentLeads: (limit = 5) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT *
        FROM leads
        ORDER BY created_at DESC
        LIMIT ?
      `;

      db.all(query, [limit], (err, leads) => {
        if (err) {
          console.error('[LeadModel] Erreur lors de la récupération des leads récents:', err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          resolve(leads);
        }
      });
    });
  },

  /**
   * Compter les leads par statut
   * @returns {Promise<Object>} Nombre de leads par statut
   */
  countByStatus: () => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT status, COUNT(*) as count
        FROM leads
        GROUP BY status
      `;

      db.all(query, [], (err, results) => {
        if (err) {
          console.error('[LeadModel] Erreur lors du comptage des leads par statut:', err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          const statusCount = {};
          results.forEach(row => {
            statusCount[row.status] = row.count;
          });
          resolve(statusCount);
        }
      });
    });
  }
};

module.exports = leadModel;
