// backend/models/projectPaymentModel.js

/**
 * Modèle pour la gestion des paiements de projets
 */

/**
 * Récupérer tous les paiements d'un projet
 */
const getProjectPayments = (db, projectId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT *
      FROM project_payments
      WHERE project_id = ?
      ORDER BY payment_date DESC, created_at DESC
    `;

    db.all(query, [projectId], (err, payments) => {
      if (err) {
        console.error('[ProjectPaymentModel] Erreur lors de la récupération des paiements:', err);
        reject(err);
      } else {
        resolve(payments || []);
      }
    });
  });
};

/**
 * Créer un nouveau paiement pour un projet
 */
const createProjectPayment = (db, projectId, paymentData) => {
  return new Promise((resolve, reject) => {
    const {
      amount,
      payment_date,
      payment_method,
      reference,
      notes,
      revenue_id
    } = paymentData;

    if (!amount || amount <= 0) {
      return reject(new Error('Le montant doit être supérieur à 0'));
    }

    const query = `
      INSERT INTO project_payments (
        project_id, amount, payment_date, payment_method,
        reference, notes, revenue_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();
    const paymentDate = payment_date || now.split('T')[0];

    db.run(
      query,
      [
        projectId,
        amount,
        paymentDate,
        payment_method || null,
        reference || null,
        notes || null,
        revenue_id || null,
        now,
        now
      ],
      function(err) {
        if (err) {
          console.error('[ProjectPaymentModel] Erreur lors de la création du paiement:', err);
          reject(err);
        } else {
          db.get(
            'SELECT * FROM project_payments WHERE id = ?',
            [this.lastID],
            (getErr, payment) => {
              if (getErr) {
                console.error('[ProjectPaymentModel] Erreur lors de la récupération du paiement créé:', getErr);
                reject(getErr);
              } else {
                resolve(payment);
              }
            }
          );
        }
      }
    );
  });
};

/**
 * Mettre à jour un paiement
 */
const updateProjectPayment = (db, paymentId, paymentData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (paymentData.amount !== undefined) {
      if (paymentData.amount <= 0) {
        return reject(new Error('Le montant doit être supérieur à 0'));
      }
      fields.push('amount = ?');
      values.push(paymentData.amount);
    }
    if (paymentData.payment_date !== undefined) {
      fields.push('payment_date = ?');
      values.push(paymentData.payment_date);
    }
    if (paymentData.payment_method !== undefined) {
      fields.push('payment_method = ?');
      values.push(paymentData.payment_method);
    }
    if (paymentData.reference !== undefined) {
      fields.push('reference = ?');
      values.push(paymentData.reference);
    }
    if (paymentData.notes !== undefined) {
      fields.push('notes = ?');
      values.push(paymentData.notes);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Ajouter updated_at
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    // Ajouter l'ID
    values.push(paymentId);

    const query = `UPDATE project_payments SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[ProjectPaymentModel] Erreur lors de la mise à jour du paiement:', err);
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Paiement non trouvé'));
      } else {
        db.get('SELECT * FROM project_payments WHERE id = ?', [paymentId], (getErr, payment) => {
          if (getErr) {
            console.error('[ProjectPaymentModel] Erreur lors de la récupération du paiement mis à jour:', getErr);
            reject(getErr);
          } else {
            resolve(payment);
          }
        });
      }
    });
  });
};

/**
 * Supprimer un paiement
 */
const deleteProjectPayment = (db, paymentId) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM project_payments WHERE id = ?', [paymentId], function(err) {
      if (err) {
        console.error('[ProjectPaymentModel] Erreur lors de la suppression du paiement:', err);
        reject(err);
      } else if (this.changes === 0) {
        reject(new Error('Paiement non trouvé'));
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Calculer le total des paiements d'un projet
 */
const getProjectPaymentsTotal = (db, projectId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM project_payments
      WHERE project_id = ?
    `;

    db.get(query, [projectId], (err, result) => {
      if (err) {
        console.error('[ProjectPaymentModel] Erreur lors du calcul du total des paiements:', err);
        reject(err);
      } else {
        resolve(parseFloat(result.total) || 0);
      }
    });
  });
};

module.exports = {
  getProjectPayments,
  createProjectPayment,
  updateProjectPayment,
  deleteProjectPayment,
  getProjectPaymentsTotal
};
