// backend/models/leadInteractionModel.js

/**
 * Modèle pour gérer les interactions avec les leads
 * (appels, emails, rencontres, notes)
 */

/**
 * Récupérer toutes les interactions d'un lead
 */
const getInteractionsByLeadId = (db, leadId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT li.*
      FROM lead_interactions li
      WHERE li.lead_id = ?
      ORDER BY li.date DESC, li.created_at DESC
    `;

    db.all(query, [leadId], (err, interactions) => {
      if (err) {
        console.error('Erreur lors de la récupération des interactions:', err);
        reject(err);
      } else {
        resolve(interactions || []);
      }
    });
  });
};

/**
 * Récupérer une interaction par son ID
 */
const getInteractionById = (db, interactionId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT li.*
      FROM lead_interactions li
      WHERE li.id = ?
    `;

    db.get(query, [interactionId], (err, interaction) => {
      if (err) {
        console.error('Erreur lors de la récupération de l\'interaction:', err);
        reject(err);
      } else {
        resolve(interaction);
      }
    });
  });
};

/**
 * Créer une nouvelle interaction
 */
const createInteraction = (db, interactionData) => {
  return new Promise((resolve, reject) => {
    const { lead_id, contact_id, type, date, description, notes } = interactionData;

    const query = `
      INSERT INTO lead_interactions (
        lead_id, contact_id, type, date, description, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [lead_id, contact_id || null, type, date, description || '', notes || '', now],
      function(err) {
        if (err) {
          console.error('Erreur lors de la création de l\'interaction:', err);
          reject(err);
        } else {
          // Récupérer l'interaction créée avec les infos du contact
          getInteractionById(db, this.lastID)
            .then(interaction => resolve(interaction))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Mettre à jour une interaction
 */
const updateInteraction = (db, interactionId, interactionData) => {
  return new Promise((resolve, reject) => {
    const { contact_id, type, date, description, notes } = interactionData;

    const query = `
      UPDATE lead_interactions
      SET contact_id = ?, type = ?, date = ?, description = ?, notes = ?
      WHERE id = ?
    `;

    db.run(
      query,
      [contact_id || null, type, date, description || '', notes || '', interactionId],
      function(err) {
        if (err) {
          console.error('Erreur lors de la mise à jour de l\'interaction:', err);
          reject(err);
        } else {
          // Récupérer l'interaction mise à jour
          getInteractionById(db, interactionId)
            .then(interaction => resolve(interaction))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Supprimer une interaction
 */
const deleteInteraction = (db, interactionId) => {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM lead_interactions WHERE id = ?';

    db.run(query, [interactionId], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression de l\'interaction:', err);
        reject(err);
      } else {
        resolve({ deleted: this.changes > 0 });
      }
    });
  });
};

module.exports = {
  getInteractionsByLeadId,
  getInteractionById,
  createInteraction,
  updateInteraction,
  deleteInteraction
};
