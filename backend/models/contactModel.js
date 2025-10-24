// backend/models/contactModel.js

/**
 * Modèle pour la gestion des contacts liés aux leads
 */
const db = require('../config/pgConfig');

const contactModel = {
  /**
   * Récupérer tous les contacts d'un lead
   * @param {number} leadId - ID du lead
   * @returns {Promise<Array>} Liste des contacts
   */
  getContactsByLead: (leadId) => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM contacts WHERE lead_id = ? ORDER BY name', [leadId], (err, contacts) => {
        if (err) {
          console.error(`[ContactModel] Erreur lors de la récupération des contacts du lead ${leadId}:`, err);
          reject(new Error('Erreur serveur lors de la récupération des contacts: ' + err.message));
        } else {
          resolve(contacts || []);
        }
      });
    });
  },

  /**
   * Récupérer un contact par son ID
   * @param {number} id - ID du contact
   * @returns {Promise<Object>} Contact
   */
  getContactById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM contacts WHERE id = ?', [id], (err, contact) => {
        if (err) {
          console.error(`[ContactModel] Erreur lors de la récupération du contact ${id}:`, err);
          reject(new Error('Erreur serveur lors de la récupération du contact: ' + err.message));
        } else {
          resolve(contact || null);
        }
      });
    });
  },

  /**
   * Créer un nouveau contact
   * @param {number} leadId - ID du lead
   * @param {Object} contactData - Données du contact
   * @returns {Promise<Object>} Contact créé
   */
  createContact: (leadId, contactData) => {
    return new Promise((resolve, reject) => {
      const { name, position, email, phone, is_primary, notes } = contactData;

      if (!name) {
        return reject(new Error('Nom du contact requis'));
      }

      // Vérifier si le lead existe
      db.get('SELECT * FROM leads WHERE id = ?', [leadId], (err, lead) => {
        if (err) {
          console.error(`[ContactModel] Erreur lors de la vérification du lead ${leadId}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!lead) {
          return reject(new Error('Lead non trouvé'));
        }

        // Si ce contact est défini comme principal, mettre à jour les autres contacts
        const updatePrimaryPromise = is_primary
          ? new Promise((resolve, reject) => {
              db.run('UPDATE contacts SET is_primary = 0 WHERE lead_id = ?', [leadId], (err) => {
                if (err) {
                  console.error('[ContactModel] Erreur lors de la mise à jour des contacts principaux:', err);
                  // Continuer malgré l'erreur
                }
                resolve();
              });
            })
          : Promise.resolve();

        updatePrimaryPromise.then(() => {
          const query = `
            INSERT INTO contacts (lead_id, name, position, email, phone, is_primary, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const now = new Date().toISOString();

          db.run(query, [
            leadId,
            name,
            position || null,
            email || null,
            phone || null,
            is_primary ? 1 : 0,
            notes || null,
            now,
            now
          ], function(err) {
            if (err) {
              console.error('[ContactModel] Erreur lors de la création du contact:', err);
              reject(new Error('Erreur serveur lors de la création du contact: ' + err.message));
            } else {
              const newContactId = this.lastID;

              // Récupérer le contact créé
              db.get('SELECT * FROM contacts WHERE id = ?', [newContactId], (err, contact) => {
                if (err) {
                  console.error('[ContactModel] Erreur lors de la récupération du contact créé:', err);
                  resolve({ id: newContactId, lead_id: leadId, ...contactData });
                } else {
                  resolve(contact);
                }
              });
            }
          });
        }).catch(err => reject(err));
      });
    });
  },

  /**
   * Mettre à jour un contact
   * @param {number} leadId - ID du lead
   * @param {number} contactId - ID du contact
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Contact mis à jour
   */
  updateContact: (leadId, contactId, updateData) => {
    return new Promise((resolve, reject) => {
      // Vérifier si le contact existe et appartient au lead
      db.get(
        'SELECT * FROM contacts WHERE id = ? AND lead_id = ?',
        [contactId, leadId],
        (err, contact) => {
          if (err) {
            console.error(`[ContactModel] Erreur lors de la vérification du contact ${contactId}:`, err);
            return reject(new Error('Erreur serveur: ' + err.message));
          }

          if (!contact) {
            return reject(new Error('Contact non trouvé'));
          }

          // Si ce contact devient principal, mettre à jour les autres contacts
          const updatePrimaryPromise = updateData.is_primary
            ? new Promise((resolve, reject) => {
                db.run(
                  'UPDATE contacts SET is_primary = 0 WHERE lead_id = ? AND id != ?',
                  [leadId, contactId],
                  (err) => {
                    if (err) {
                      console.error('[ContactModel] Erreur lors de la mise à jour des contacts principaux:', err);
                      // Continuer malgré l'erreur
                    }
                    resolve();
                  }
                );
              })
            : Promise.resolve();

          updatePrimaryPromise.then(() => {
            // Construire la requête de mise à jour
            const updates = [];
            const params = [];

            if (updateData.name !== undefined) {
              updates.push('name = ?');
              params.push(updateData.name);
            }

            if (updateData.position !== undefined) {
              updates.push('position = ?');
              params.push(updateData.position);
            }

            if (updateData.email !== undefined) {
              updates.push('email = ?');
              params.push(updateData.email);
            }

            if (updateData.phone !== undefined) {
              updates.push('phone = ?');
              params.push(updateData.phone);
            }

            if (updateData.is_primary !== undefined) {
              updates.push('is_primary = ?');
              params.push(updateData.is_primary ? 1 : 0);
            }

            if (updateData.notes !== undefined) {
              updates.push('notes = ?');
              params.push(updateData.notes);
            }

            // Ajouter la date de mise à jour
            updates.push('updated_at = ?');
            params.push(new Date().toISOString());

            // Ajouter les IDs pour la clause WHERE
            params.push(contactId);
            params.push(leadId);

            const query = `
              UPDATE contacts
              SET ${updates.join(', ')}
              WHERE id = ? AND lead_id = ?
            `;

            db.run(query, params, function(err) {
              if (err) {
                console.error(`[ContactModel] Erreur lors de la mise à jour du contact ${contactId}:`, err);
                reject(new Error('Erreur serveur: ' + err.message));
              } else {
                // Récupérer le contact mis à jour
                db.get('SELECT * FROM contacts WHERE id = ?', [contactId], (err, updatedContact) => {
                  if (err) {
                    console.error('[ContactModel] Erreur lors de la récupération du contact mis à jour:', err);
                    resolve({ id: contactId, lead_id: leadId, ...contact, ...updateData });
                  } else {
                    resolve(updatedContact);
                  }
                });
              }
            });
          }).catch(err => reject(err));
        }
      );
    });
  },

  /**
   * Supprimer un contact
   * @param {number} leadId - ID du lead
   * @param {number} contactId - ID du contact
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteContact: (leadId, contactId) => {
    return new Promise((resolve, reject) => {
      // Vérifier si le contact existe et appartient au lead
      db.get(
        'SELECT * FROM contacts WHERE id = ? AND lead_id = ?',
        [contactId, leadId],
        (err, contact) => {
          if (err) {
            console.error(`[ContactModel] Erreur lors de la vérification du contact ${contactId}:`, err);
            return reject(new Error('Erreur serveur: ' + err.message));
          }

          if (!contact) {
            return reject(new Error('Contact non trouvé'));
          }

          // Supprimer le contact
          db.run(
            'DELETE FROM contacts WHERE id = ? AND lead_id = ?',
            [contactId, leadId],
            function(err) {
              if (err) {
                console.error(`[ContactModel] Erreur lors de la suppression du contact ${contactId}:`, err);
                reject(new Error('Erreur serveur: ' + err.message));
              } else {
                resolve({ id: contactId, changes: this.changes });
              }
            }
          );
        }
      );
    });
  },

  /**
   * Récupérer le contact principal d'un lead
   * @param {number} leadId - ID du lead
   * @returns {Promise<Object>} Contact principal
   */
  getPrimaryContact: (leadId) => {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM contacts WHERE lead_id = ? AND is_primary = 1',
        [leadId],
        (err, contact) => {
          if (err) {
            console.error(`[ContactModel] Erreur lors de la récupération du contact principal du lead ${leadId}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            resolve(contact || null);
          }
        }
      );
    });
  },

  /**
   * Récupérer tous les contacts (tous les leads)
   * @returns {Promise<Array>} Liste de tous les contacts
   */
  getAllContacts: () => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT c.*, l.name as lead_name
        FROM contacts c
        LEFT JOIN leads l ON c.lead_id = l.id
        ORDER BY c.name ASC
      `;

      db.all(query, [], (err, contacts) => {
        if (err) {
          console.error('[ContactModel] Erreur lors de la récupération de tous les contacts:', err);
          reject(new Error('Erreur serveur: ' + err.message));
        } else {
          resolve(contacts);
        }
      });
    });
  }
};

module.exports = contactModel;
