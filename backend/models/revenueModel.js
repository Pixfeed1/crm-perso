// backend/models/revenueModel.js
/**
 * Modèle pour la gestion des revenus (PostgreSQL)
 */

/**
 * Récupère tous les revenus avec filtres optionnels
 */
const getAllRevenues = async (pool, filters = {}) => {
  try {
    let query = `
      SELECT r.*, p.name as project_name, c.name as client_name
      FROM revenues r
      LEFT JOIN projects p ON r.project_id = p.id
      LEFT JOIN crm_clients c ON r.client_id = c.id
    `;
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    // Ajouter des filtres si spécifiés
    if (filters.start_date) {
      conditions.push(`r.date >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`r.date <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (filters.type) {
      conditions.push(`r.type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (filters.status) {
      conditions.push(`r.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.project_id) {
      conditions.push(`r.project_id = $${paramIndex++}`);
      params.push(filters.project_id);
    }

    if (filters.lead_id) {
      conditions.push(`r.lead_id = $${paramIndex++}`);
      params.push(filters.lead_id);
    }

    if (filters.client_id) {
      conditions.push(`r.client_id = $${paramIndex++}`);
      params.push(filters.client_id);
    }

    // Appliquer les conditions si elles existent
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY r.date DESC, r.id DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('[RevenueModel] Erreur lors de la récupération des revenus:', error);
    throw error;
  }
};

/**
 * Récupère un revenu par son ID
 */
const getRevenueById = async (pool, id) => {
  try {
    const query = `
      SELECT r.*, p.name as project_name, c.name as client_name
      FROM revenues r
      LEFT JOIN projects p ON r.project_id = p.id
      LEFT JOIN crm_clients c ON r.client_id = c.id
      WHERE r.id = $1
    `;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new Error('Revenu non trouvé');
    }

    return result.rows[0];
  } catch (error) {
    console.error('[RevenueModel] Erreur lors de la récupération du revenu:', error);
    throw error;
  }
};

/**
 * Crée un nouveau revenu
 */
const createRevenue = async (pool, revenueData) => {
  try {
    const {
      amount,
      date,
      description,
      type,
      status = 'pending',
      project_id,
      lead_id,
      client_id,
      payment_method,
      invoice_number,
      notes
    } = revenueData;

    if (!amount || !date) {
      throw new Error('Montant et date sont requis');
    }

    const query = `
      INSERT INTO revenues (
        amount, date, description, type, status,
        project_id, lead_id, client_id, payment_method,
        invoice_number, notes, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await pool.query(query, [
      amount,
      date,
      description || null,
      type || null,
      status,
      project_id || null,
      lead_id || null,
      client_id || null,
      payment_method || null,
      invoice_number || null,
      notes || null
    ]);

    console.log('[RevenueModel] ✅ Revenu créé avec succès:', result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error('[RevenueModel] ❌ Erreur lors de la création du revenu:', error);
    throw error;
  }
};

/**
 * Met à jour un revenu existant
 */
const updateRevenue = async (pool, id, revenueData) => {
  try {
    const {
      amount,
      date,
      description,
      type,
      status,
      project_id,
      lead_id,
      client_id,
      payment_method,
      invoice_number,
      notes
    } = revenueData;

    const query = `
      UPDATE revenues
      SET
        amount = COALESCE($1, amount),
        date = COALESCE($2, date),
        description = COALESCE($3, description),
        type = COALESCE($4, type),
        status = COALESCE($5, status),
        project_id = COALESCE($6, project_id),
        lead_id = COALESCE($7, lead_id),
        client_id = COALESCE($8, client_id),
        payment_method = COALESCE($9, payment_method),
        invoice_number = COALESCE($10, invoice_number),
        notes = COALESCE($11, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `;

    const result = await pool.query(query, [
      amount,
      date,
      description,
      type,
      status,
      project_id,
      lead_id,
      client_id,
      payment_method,
      invoice_number,
      notes,
      id
    ]);

    if (result.rows.length === 0) {
      throw new Error('Revenu non trouvé');
    }

    console.log('[RevenueModel] ✅ Revenu mis à jour avec succès:', result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error('[RevenueModel] ❌ Erreur lors de la mise à jour du revenu:', error);
    throw error;
  }
};

/**
 * Supprime un revenu
 */
const deleteRevenue = async (pool, id) => {
  try {
    const query = 'DELETE FROM revenues WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new Error('Revenu non trouvé');
    }

    console.log('[RevenueModel] ✅ Revenu supprimé avec succès');
    return { success: true, deleted: result.rows[0] };
  } catch (error) {
    console.error('[RevenueModel] ❌ Erreur lors de la suppression du revenu:', error);
    throw error;
  }
};

/**
 * Calcule les statistiques des revenus
 */
const getRevenueStats = async (pool, filters = {}) => {
  try {
    let query = `
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN status = 'planned' THEN amount ELSE 0 END) as total_planned,
        SUM(amount) as total_all,
        AVG(amount) as average_amount,
        MAX(amount) as max_amount,
        MIN(amount) as min_amount
      FROM revenues
    `;

    const params = [];
    const conditions = [];
    let paramIndex = 1;

    if (filters.start_date) {
      conditions.push(`date >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`date <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (filters.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const result = await pool.query(query, params);

    // Convertir les valeurs en nombres
    const stats = result.rows[0];
    return {
      total_count: parseInt(stats.total_count) || 0,
      total_paid: parseFloat(stats.total_paid) || 0,
      total_pending: parseFloat(stats.total_pending) || 0,
      total_planned: parseFloat(stats.total_planned) || 0,
      total_all: parseFloat(stats.total_all) || 0,
      average_amount: parseFloat(stats.average_amount) || 0,
      max_amount: parseFloat(stats.max_amount) || 0,
      min_amount: parseFloat(stats.min_amount) || 0
    };
  } catch (error) {
    console.error('[RevenueModel] Erreur lors du calcul des stats:', error);
    throw error;
  }
};

/**
 * Récupère les revenus par mois pour les graphiques
 */
const getRevenuesByMonth = async (pool, year) => {
  try {
    const query = `
      SELECT
        EXTRACT(MONTH FROM date) as month,
        status,
        SUM(amount) as total
      FROM revenues
      WHERE EXTRACT(YEAR FROM date) = $1
      GROUP BY EXTRACT(MONTH FROM date), status
      ORDER BY month
    `;

    const result = await pool.query(query, [year]);
    return result.rows;
  } catch (error) {
    console.error('[RevenueModel] Erreur lors de la récupération des revenus par mois:', error);
    throw error;
  }
};

module.exports = {
  getAllRevenues,
  getRevenueById,
  createRevenue,
  updateRevenue,
  deleteRevenue,
  getRevenueStats,
  getRevenuesByMonth
};
