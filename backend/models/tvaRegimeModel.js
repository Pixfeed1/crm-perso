// backend/models/tvaRegimeModel.js

/**
 * Récupère tous les régimes TVA actifs
 */
const getAllTvaRegimes = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM tva_regimes
      WHERE is_active = true
      ORDER BY rate DESC
    `;

    db.pool.query(query, [], (err, result) => {
      if (err) {
        console.error('[TvaRegimeModel] Erreur lors de la récupération:', err);
        return reject(err);
      }
      resolve(result.rows || []);
    });
  });
};

/**
 * Récupère un régime TVA par son code
 */
const getTvaRegimeByCode = (db, code) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM tva_regimes WHERE code = $1';

    db.pool.query(query, [code], (err, result) => {
      if (err) {
        console.error('[TvaRegimeModel] Erreur lors de la récupération:', err);
        return reject(err);
      }
      resolve(result.rows[0] || null);
    });
  });
};

module.exports = {
  getAllTvaRegimes,
  getTvaRegimeByCode
};
