// backend/models/revenueModel.js

/**
 * Récupère tous les revenus avec filtres optionnels
 */
const getAllRevenues = (db, filters = {}) => {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT r.*, p.name as project_name
      FROM revenues r
      LEFT JOIN projects p ON r.project_id = p.id
    `;
    const params = [];
    const conditions = [];

    // Ajouter des filtres si spécifiés
    if (filters.start_date) {
      conditions.push('r.date >= ?');
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push('r.date <= ?');
      params.push(filters.end_date);
    }

    if (filters.type) {
      conditions.push('r.type = ?');
      params.push(filters.type);
    }

    if (filters.project_id) {
      conditions.push('r.project_id = ?');
      params.push(filters.project_id);
    }

    if (filters.lead_id) {
      conditions.push('r.lead_id = ?');
      params.push(filters.lead_id);
    }

    // Appliquer les conditions si elles existent
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY r.date DESC';

    db.all(query, params, (err, revenues) => {
      if (err) {
        console.error('[RevenueModel] Erreur lors de la récupération des revenus:', err);
        reject(err);
      } else {
        resolve(revenues || []);
      }
    });
  });
};

/**
 * Récupère un revenu par son ID
 */
const getRevenueById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT r.*, p.name as project_name
      FROM revenues r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE r.id = ?
    `;

    db.get(query, [id], (err, revenue) => {
      if (err) {
        console.error('[RevenueModel] Erreur lors de la récupération du revenu:', err);
        reject(err);
      } else {
        resolve(revenue);
      }
    });
  });
};

/**
 * Crée un nouveau revenu
 */
const createRevenue = (db, revenueData) => {
  return new Promise((resolve, reject) => {
    const {
      amount,
      date,
      description,
      project_id,
      lead_id,
      type
    } = revenueData;

    if (!amount || !date || !type) {
      return reject(new Error('Montant, date et type sont requis'));
    }

    const query = `
      INSERT INTO revenues (amount, date, description, project_id, lead_id, type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(
      query,
      [
        amount,
        date,
        description || null,
        project_id || null,
        lead_id || null,
        type,
        now
      ],
      function(err) {
        if (err) {
          console.error('[RevenueModel] Erreur lors de la création du revenu:', err);
          reject(err);
        } else {
          getRevenueById(db, this.lastID)
            .then(revenue => resolve(revenue))
            .catch(err => reject(err));
        }
      }
    );
  });
};

/**
 * Met à jour un revenu
 */
const updateRevenue = (db, id, revenueData) => {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (revenueData.amount !== undefined) {
      fields.push('amount = ?');
      values.push(revenueData.amount);
    }
    if (revenueData.date !== undefined) {
      fields.push('date = ?');
      values.push(revenueData.date);
    }
    if (revenueData.description !== undefined) {
      fields.push('description = ?');
      values.push(revenueData.description);
    }
    if (revenueData.project_id !== undefined) {
      fields.push('project_id = ?');
      values.push(revenueData.project_id);
    }
    if (revenueData.lead_id !== undefined) {
      fields.push('lead_id = ?');
      values.push(revenueData.lead_id);
    }
    if (revenueData.type !== undefined) {
      fields.push('type = ?');
      values.push(revenueData.type);
    }

    if (fields.length === 0) {
      return reject(new Error('Aucun champ à mettre à jour'));
    }

    // Ajouter l'ID pour la clause WHERE
    values.push(id);

    const query = `UPDATE revenues SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        console.error('[RevenueModel] Erreur lors de la mise à jour du revenu:', err);
        reject(err);
      } else {
        getRevenueById(db, id)
          .then(revenue => resolve(revenue))
          .catch(err => reject(err));
      }
    });
  });
};

/**
 * Supprime un revenu
 */
const deleteRevenue = (db, id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM revenues WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('[RevenueModel] Erreur lors de la suppression du revenu:', err);
        reject(err);
      } else {
        resolve({ success: true, changes: this.changes });
      }
    });
  });
};

/**
 * Récupère les statistiques des revenus
 */
const getRevenueStats = (db, filters = {}) => {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT
        COUNT(*) as total_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount
      FROM revenues
    `;
    const params = [];
    const conditions = [];

    // Ajouter des filtres si spécifiés
    if (filters.start_date) {
      conditions.push('date >= ?');
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push('date <= ?');
      params.push(filters.end_date);
    }

    if (filters.type) {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters.project_id) {
      conditions.push('project_id = ?');
      params.push(filters.project_id);
    }

    // Appliquer les conditions si elles existent
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    db.get(query, params, (err, stats) => {
      if (err) {
        console.error('[RevenueModel] Erreur lors de la récupération des statistiques:', err);
        return reject(err);
      }

      // Statistiques par type
      let typeQuery = `
        SELECT
          type,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM revenues
      `;

      if (conditions.length > 0) {
        typeQuery += ' WHERE ' + conditions.join(' AND ');
      }

      typeQuery += ' GROUP BY type';

      db.all(typeQuery, params, (err, typeStats) => {
        if (err) {
          console.error('[RevenueModel] Erreur lors de la récupération des stats par type:', err);
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
 * Récupère les revenus d'un projet spécifique
 */
const getRevenuesByProject = (db, projectId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM revenues
      WHERE project_id = ?
      ORDER BY date DESC
    `;

    db.all(query, [projectId], (err, revenues) => {
      if (err) {
        console.error('[RevenueModel] Erreur lors de la récupération des revenus du projet:', err);
        reject(err);
      } else {
        resolve(revenues || []);
      }
    });
  });
};

/**
 * Récupère les revenus d'un lead spécifique
 */
const getRevenuesByLead = (db, leadId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM revenues
      WHERE lead_id = ?
      ORDER BY date DESC
    `;

    db.all(query, [leadId], (err, revenues) => {
      if (err) {
        console.error('[RevenueModel] Erreur lors de la récupération des revenus du lead:', err);
        reject(err);
      } else {
        resolve(revenues || []);
      }
    });
  });
};

/**
 * Calcule le total des revenus pour une période
 */
const getTotalRevenueForPeriod = (db, startDate, endDate) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT SUM(amount) as total
      FROM revenues
      WHERE date >= ? AND date <= ?
    `;

    db.get(query, [startDate, endDate], (err, result) => {
      if (err) {
        console.error('[RevenueModel] Erreur lors du calcul du total des revenus:', err);
        reject(err);
      } else {
        resolve(result.total || 0);
      }
    });
  });
};

module.exports = {
  getAllRevenues,
  getRevenueById,
  createRevenue,
  updateRevenue,
  deleteRevenue,
  getRevenueStats,
  getRevenuesByProject,
  getRevenuesByLead,
  getTotalRevenueForPeriod
};
