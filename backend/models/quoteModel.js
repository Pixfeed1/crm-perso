// backend/models/quoteModel.js
const db = require('../config/pgConfig');

/**
 * Générer un numéro de devis unique
 * Format: DEVIS-YYYY-XXX (ex: DEVIS-2025-001)
 */
async function generateQuoteNumber() {
  const year = new Date().getFullYear();
  const prefix = `DEVIS-${year}-`;

  return new Promise((resolve, reject) => {
    // Récupérer le dernier numéro pour l'année en cours
    db.get(
      `SELECT quote_number FROM quotes WHERE quote_number LIKE ? ORDER BY quote_number DESC LIMIT 1`,
      [`${prefix}%`],
      (err, row) => {
        if (err) {
          return reject(err);
        }

        let nextNumber = 1;
        if (row && row.quote_number) {
          const lastNumber = parseInt(row.quote_number.split('-')[2]);
          nextNumber = lastNumber + 1;
        }

        const quoteNumber = `${prefix}${String(nextNumber).padStart(3, '0')}`;
        resolve(quoteNumber);
      }
    );
  });
}

/**
 * Obtenir tous les devis d'un utilisateur
 */
function getAllQuotes(userId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        q.*,
        l.name as lead_name,
        l.company as lead_company
      FROM quotes q
      LEFT JOIN leads l ON q.lead_id = l.id
      WHERE q.user_id = ?
      ORDER BY q.created_at DESC
    `;

    db.all(query, [userId], (err, quotes) => {
      if (err) {
        return reject(err);
      }
      resolve(quotes || []);
    });
  });
}

/**
 * Obtenir un devis par son ID avec ses lignes
 */
async function getQuoteById(quoteId, userId) {
  return new Promise((resolve, reject) => {
    // Récupérer le devis
    const quoteQuery = `
      SELECT
        q.*,
        l.name as lead_name,
        l.company as lead_company,
        l.email as lead_email,
        l.phone as lead_phone
      FROM quotes q
      LEFT JOIN leads l ON q.lead_id = l.id
      WHERE q.id = ? AND q.user_id = ?
    `;

    db.get(quoteQuery, [quoteId, userId], async (err, quote) => {
      if (err) {
        return reject(err);
      }

      if (!quote) {
        return resolve(null);
      }

      // Récupérer les lignes
      const itemsQuery = `
        SELECT * FROM quote_items
        WHERE quote_id = ?
        ORDER BY position ASC, id ASC
      `;

      db.all(itemsQuery, [quoteId], (err, items) => {
        if (err) {
          return reject(err);
        }

        quote.items = items || [];
        resolve(quote);
      });
    });
  });
}

/**
 * Créer un nouveau devis
 */
async function createQuote(userId, quoteData) {
  const { title, lead_id, items, notes, terms, valid_until, tax_rate = 20 } = quoteData;

  // Générer le numéro de devis
  const quoteNumber = await generateQuoteNumber();

  // Calculer les totaux
  let subtotal = 0;
  items.forEach(item => {
    subtotal += parseFloat(item.total_price || 0);
  });

  const taxAmount = (subtotal * tax_rate) / 100;
  const totalAmount = subtotal + taxAmount;

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO quotes (
        quote_number, title, lead_id, user_id, status, subtotal,
        tax_rate, tax_amount, total_amount, notes, terms, valid_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quoteNumber, title, lead_id, userId, 'draft', subtotal,
        tax_rate, taxAmount, totalAmount, notes, terms, valid_until
      ],
      function(err) {
        if (err) {
          return reject(err);
        }

        const quoteId = this.lastID;

        // Insérer les lignes
        const insertItems = items.map((item, index) => {
          return new Promise((resolveItem, rejectItem) => {
            db.run(
              `INSERT INTO quote_items (quote_id, description, quantity, unit_price, total_price, position)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [quoteId, item.description, item.quantity, item.unit_price, item.total_price, index],
              (err) => {
                if (err) return rejectItem(err);
                resolveItem();
              }
            );
          });
        });

        Promise.all(insertItems)
          .then(() => {
            // Récupérer le devis complet
            getQuoteById(quoteId, userId).then(resolve).catch(reject);
          })
          .catch(reject);
      }
    );
  });
}

/**
 * Mettre à jour un devis
 */
async function updateQuote(quoteId, userId, quoteData) {
  const { title, lead_id, items, notes, terms, valid_until, tax_rate } = quoteData;

  // Calculer les nouveaux totaux
  let subtotal = 0;
  items.forEach(item => {
    subtotal += parseFloat(item.total_price || 0);
  });

  const taxAmount = (subtotal * (tax_rate || 20)) / 100;
  const totalAmount = subtotal + taxAmount;

  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE quotes SET
        title = ?, lead_id = ?, subtotal = ?, tax_rate = ?, tax_amount = ?,
        total_amount = ?, notes = ?, terms = ?, valid_until = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [title, lead_id, subtotal, tax_rate, taxAmount, totalAmount, notes, terms, valid_until, quoteId, userId],
      function(err) {
        if (err) {
          return reject(err);
        }

        if (this.changes === 0) {
          return reject(new Error('Devis non trouvé'));
        }

        // Supprimer les anciennes lignes
        db.run(`DELETE FROM quote_items WHERE quote_id = ?`, [quoteId], (err) => {
          if (err) {
            return reject(err);
          }

          // Insérer les nouvelles lignes
          const insertItems = items.map((item, index) => {
            return new Promise((resolveItem, rejectItem) => {
              db.run(
                `INSERT INTO quote_items (quote_id, description, quantity, unit_price, total_price, position)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [quoteId, item.description, item.quantity, item.unit_price, item.total_price, index],
                (err) => {
                  if (err) return rejectItem(err);
                  resolveItem();
                }
              );
            });
          });

          Promise.all(insertItems)
            .then(() => {
              getQuoteById(quoteId, userId).then(resolve).catch(reject);
            })
            .catch(reject);
        });
      }
    );
  });
}

/**
 * Supprimer un devis
 */
function deleteQuote(quoteId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM quotes WHERE id = ? AND user_id = ?`,
      [quoteId, userId],
      function(err) {
        if (err) {
          return reject(err);
        }

        if (this.changes === 0) {
          return reject(new Error('Devis non trouvé'));
        }

        resolve({ message: 'Devis supprimé avec succès' });
      }
    );
  });
}

/**
 * Changer le statut d'un devis
 */
function updateQuoteStatus(quoteId, userId, status, additionalData = {}) {
  return new Promise((resolve, reject) => {
    let updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    let values = [status];

    // Ajouter les champs de date selon le statut
    if (status === 'sent' && !additionalData.skipSentAt) {
      updateFields.push('sent_at = CURRENT_TIMESTAMP');
    } else if (status === 'accepted') {
      updateFields.push('accepted_at = CURRENT_TIMESTAMP');
    } else if (status === 'rejected') {
      updateFields.push('rejected_at = CURRENT_TIMESTAMP');
    }

    values.push(quoteId, userId);

    db.run(
      `UPDATE quotes SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`,
      values,
      function(err) {
        if (err) {
          return reject(err);
        }

        if (this.changes === 0) {
          return reject(new Error('Devis non trouvé'));
        }

        getQuoteById(quoteId, userId).then(resolve).catch(reject);
      }
    );
  });
}

module.exports = {
  generateQuoteNumber,
  getAllQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  deleteQuote,
  updateQuoteStatus
};
