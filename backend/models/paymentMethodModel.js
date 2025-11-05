// backend/models/paymentMethodModel.js

/**
 * Récupère tous les moyens de paiement actifs
 */
const getAllPaymentMethods = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM payment_methods
      WHERE is_active = true
      ORDER BY label ASC
    `;

    db.pool.query(query, [], (err, result) => {
      if (err) {
        console.error('[PaymentMethodModel] Erreur lors de la récupération:', err);
        return reject(err);
      }
      resolve(result.rows || []);
    });
  });
};

/**
 * Récupère un moyen de paiement par son code
 */
const getPaymentMethodByCode = (db, code) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM payment_methods WHERE code = $1';

    db.pool.query(query, [code], (err, result) => {
      if (err) {
        console.error('[PaymentMethodModel] Erreur lors de la récupération:', err);
        return reject(err);
      }
      resolve(result.rows[0] || null);
    });
  });
};

module.exports = {
  getAllPaymentMethods,
  getPaymentMethodByCode
};
