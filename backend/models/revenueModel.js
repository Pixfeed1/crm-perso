// backend/models/revenueModel.js

/**
 * Modèle pour la gestion des revenus
 */
const db = require('../config/pgConfig');

const revenueModel = {
  /**
   * Récupérer tous les revenus avec filtres optionnels
   * @param {Object} filters - Filtres (start_date, end_date, type, project_id)
   * @returns {Promise<Array>} Liste des revenus
   */
  getAllRevenues: (filters = {}) => {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT r.*, p.name as project_name
        FROM revenues r
        LEFT JOIN projects p ON r.project_id = p.id
      `;
      let params = [];
      let conditions = [];

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

      // Appliquer les conditions si elles existent
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY r.date DESC';

      db.all(query, params, (err, revenues) => {
        if (err) {
          console.error('[RevenueModel] Erreur lors de la récupération des revenus:', err);
          reject(new Error('Erreur serveur lors de la récupération des revenus: ' + err.message));
        } else {
          resolve(revenues);
        }
      });
    });
  },

  /**
   * Récupérer un revenu par son ID
   * @param {number} id - ID du revenu
   * @returns {Promise<Object>} Revenu
   */
  getRevenueById: (id) => {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT r.*, p.name as project_name
        FROM revenues r
        LEFT JOIN projects p ON r.project_id = p.id
        WHERE r.id = ?
      `;

      db.get(query, [id], (err, revenue) => {
        if (err) {
          console.error(`[RevenueModel] Erreur lors de la récupération du revenu ${id}:`, err);
          reject(new Error('Erreur serveur lors de la récupération du revenu: ' + err.message));
        } else {
          resolve(revenue || null);
        }
      });
    });
  },

  /**
   * Créer un nouveau revenu
   * @param {Object} revenueData - Données du revenu
   * @returns {Promise<Object>} Revenu créé
   */
  createRevenue: (revenueData) => {
    return new Promise((resolve, reject) => {
      const { amount, date, description, project_id, type, status } = revenueData;

      if (!amount || !date || !type) {
        return reject(new Error('Montant, date et type sont requis'));
      }

      const query = `
        INSERT INTO revenues (amount, date, description, project_id, type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const now = new Date().toISOString();

      db.run(query, [
        amount,
        date,
        description || null,
        project_id || null,
        type,
        status || 'pending',
        now,
        now
      ], function(err) {
        if (err) {
          console.error('[RevenueModel] Erreur lors de la création du revenu:', err);
          reject(new Error('Erreur serveur lors de la création du revenu: ' + err.message));
        } else {
          const newRevenueId = this.lastID;

          // Récupérer le revenu créé avec le nom du projet
          const getQuery = `
            SELECT r.*, p.name as project_name
            FROM revenues r
            LEFT JOIN projects p ON r.project_id = p.id
            WHERE r.id = ?
          `;

          db.get(getQuery, [newRevenueId], (err, revenue) => {
            if (err) {
              console.error('[RevenueModel] Erreur lors de la récupération du revenu créé:', err);
              resolve({ id: newRevenueId, ...revenueData });
            } else {
              resolve(revenue);
            }
          });
        }
      });
    });
  },

  /**
   * Mettre à jour un revenu
   * @param {number} id - ID du revenu
   * @param {Object} updateData - Données à mettre à jour
   * @returns {Promise<Object>} Revenu mis à jour
   */
  updateRevenue: (id, updateData) => {
    return new Promise((resolve, reject) => {
      // Vérifier si le revenu existe
      db.get('SELECT * FROM revenues WHERE id = ?', [id], (err, revenue) => {
        if (err) {
          console.error(`[RevenueModel] Erreur lors de la vérification du revenu ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!revenue) {
          return reject(new Error('Revenu non trouvé'));
        }

        // Construire la requête de mise à jour
        const updates = [];
        const params = [];

        if (updateData.amount !== undefined) {
          updates.push('amount = ?');
          params.push(updateData.amount);
        }

        if (updateData.date !== undefined) {
          updates.push('date = ?');
          params.push(updateData.date);
        }

        if (updateData.description !== undefined) {
          updates.push('description = ?');
          params.push(updateData.description);
        }

        if (updateData.project_id !== undefined) {
          updates.push('project_id = ?');
          params.push(updateData.project_id);
        }

        if (updateData.type !== undefined) {
          updates.push('type = ?');
          params.push(updateData.type);
        }

        if (updateData.status !== undefined) {
          updates.push('status = ?');
          params.push(updateData.status);
        }

        // Ajouter la date de mise à jour
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());

        // Ajouter l'ID pour la clause WHERE
        params.push(id);

        const query = `
          UPDATE revenues
          SET ${updates.join(', ')}
          WHERE id = ?
        `;

        db.run(query, params, function(err) {
          if (err) {
            console.error(`[RevenueModel] Erreur lors de la mise à jour du revenu ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            // Récupérer le revenu mis à jour
            const getQuery = `
              SELECT r.*, p.name as project_name
              FROM revenues r
              LEFT JOIN projects p ON r.project_id = p.id
              WHERE r.id = ?
            `;

            db.get(getQuery, [id], (err, updatedRevenue) => {
              if (err) {
                console.error('[RevenueModel] Erreur lors de la récupération du revenu mis à jour:', err);
                resolve({ id, ...revenue, ...updateData });
              } else {
                resolve(updatedRevenue);
              }
            });
          }
        });
      });
    });
  },

  /**
   * Supprimer un revenu
   * @param {number} id - ID du revenu
   * @returns {Promise<Object>} Résultat de la suppression
   */
  deleteRevenue: (id) => {
    return new Promise((resolve, reject) => {
      // Vérifier si le revenu existe
      db.get('SELECT * FROM revenues WHERE id = ?', [id], (err, revenue) => {
        if (err) {
          console.error(`[RevenueModel] Erreur lors de la vérification du revenu ${id}:`, err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        if (!revenue) {
          return reject(new Error('Revenu non trouvé'));
        }

        // Supprimer le revenu
        db.run('DELETE FROM revenues WHERE id = ?', [id], function(err) {
          if (err) {
            console.error(`[RevenueModel] Erreur lors de la suppression du revenu ${id}:`, err);
            reject(new Error('Erreur serveur: ' + err.message));
          } else {
            resolve({ id, changes: this.changes });
          }
        });
      });
    });
  },

  /**
   * Obtenir les statistiques des revenus
   * @param {string} period - Période ('month', 'quarter', 'year')
   * @returns {Promise<Object>} Statistiques
   */
  getRevenueStats: (period) => {
    return new Promise((resolve, reject) => {
      let timeFilter = '';
      let params = [];

      // Déterminer le filtre de temps
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      if (period === 'month') {
        const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
        const endOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
        timeFilter = 'WHERE date >= ? AND date <= ?';
        params = [startOfMonth, endOfMonth];
      } else if (period === 'year') {
        const startOfYear = `${currentYear}-01-01`;
        const endOfYear = `${currentYear}-12-31`;
        timeFilter = 'WHERE date >= ? AND date <= ?';
        params = [startOfYear, endOfYear];
      } else if (period === 'quarter') {
        const quarterStartMonth = Math.floor((currentMonth - 1) / 3) * 3 + 1;
        const quarterEndMonth = quarterStartMonth + 2;
        const startOfQuarter = `${currentYear}-${String(quarterStartMonth).padStart(2, '0')}-01`;
        const endOfQuarter = new Date(currentYear, quarterEndMonth, 0).toISOString().split('T')[0];
        timeFilter = 'WHERE date >= ? AND date <= ?';
        params = [startOfQuarter, endOfQuarter];
      }

      const stats = {
        total: 0,
        by_type: {},
        by_project: {},
        by_status: {},
        trend: []
      };

      // 1. Total
      db.get(`SELECT SUM(amount) as total FROM revenues ${timeFilter}`, params, (err, result) => {
        if (err) {
          console.error('[RevenueModel] Erreur lors du calcul du total:', err);
          return reject(new Error('Erreur serveur: ' + err.message));
        }

        stats.total = result.total || 0;

        // 2. Par type
        db.all(`
          SELECT type, SUM(amount) as amount
          FROM revenues
          ${timeFilter}
          GROUP BY type
          ORDER BY amount DESC
        `, params, (err, typeResults) => {
          if (err) {
            console.error('[RevenueModel] Erreur lors du calcul par type:', err);
            return reject(new Error('Erreur serveur: ' + err.message));
          }

          typeResults.forEach(item => {
            stats.by_type[item.type] = item.amount;
          });

          // 3. Par statut
          db.all(`
            SELECT status, SUM(amount) as amount, COUNT(*) as count
            FROM revenues
            ${timeFilter}
            GROUP BY status
          `, params, (err, statusResults) => {
            if (err) {
              console.error('[RevenueModel] Erreur lors du calcul par statut:', err);
              return reject(new Error('Erreur serveur: ' + err.message));
            }

            statusResults.forEach(item => {
              stats.by_status[item.status] = {
                amount: item.amount,
                count: item.count
              };
            });

            // 4. Tendance (6 derniers mois)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
            const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0].substring(0, 7);

            db.all(`
              SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount
              FROM revenues
              WHERE strftime('%Y-%m', date) >= ?
              GROUP BY month
              ORDER BY month
            `, [sixMonthsAgoStr], (err, trendResults) => {
              if (err) {
                console.error('[RevenueModel] Erreur lors du calcul de la tendance:', err);
                // Continuer malgré l'erreur
                stats.trend = [];
              } else {
                stats.trend = trendResults.map(item => ({
                  month: item.month,
                  amount: item.amount
                }));
              }

              resolve(stats);
            });
          });
        });
      });
    });
  }
};

module.exports = revenueModel;
