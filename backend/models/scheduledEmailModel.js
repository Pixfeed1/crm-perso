// backend/models/scheduledEmailModel.js

/**
 * GESTION DES EMAILS PROGRAMMÉS EN DIFFÉRÉ
 *
 * Ce modèle gère :
 * - Création d'emails à envoyer plus tard
 * - Récupération des emails prêts à être envoyés
 * - Mise à jour du statut après envoi
 * - Historique et statistiques
 */

/**
 * Crée un email programmé
 * @param {Object} db - Instance de la base de données
 * @param {Object} emailData - Données de l'email
 * @returns {Promise<Object>} - Email créé
 */
const createScheduledEmail = async (db, emailData) => {
  try {
    const {
      to_email,
      to_name = null,
      cc_email = null,
      subject,
      body_html,
      body_text = null,
      attachments = [],
      scheduled_at,
      timezone = 'Europe/Paris',
      email_type = 'custom',
      related_type = null,
      related_id = null,
      created_by = null,
      notes = null
    } = emailData;

    const result = await db.pool.query(
      `INSERT INTO scheduled_emails
       (to_email, to_name, cc_email, subject, body_html, body_text, attachments,
        scheduled_at, timezone, email_type, related_type, related_id, created_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [to_email, to_name, cc_email, subject, body_html, body_text, JSON.stringify(attachments),
       scheduled_at, timezone, email_type, related_type, related_id, created_by, notes]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erreur createScheduledEmail:', error);
    throw error;
  }
};

/**
 * Récupère les emails prêts à être envoyés
 * (status = pending et scheduled_at <= maintenant)
 * @param {Object} db - Instance de la base de données
 * @param {number} limit - Nombre max d'emails à traiter
 * @returns {Promise<Array>} - Liste des emails à envoyer
 */
const getEmailsReadyToSend = async (db, limit = 50) => {
  try {
    const result = await db.pool.query(
      `SELECT *
       FROM scheduled_emails
       WHERE status = 'pending'
         AND scheduled_at <= NOW()
         AND retry_count < max_retries
       ORDER BY scheduled_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Erreur getEmailsReadyToSend:', error);
    throw error;
  }
};

/**
 * Marque un email comme envoyé
 * @param {Object} db - Instance de la base de données
 * @param {number} emailId - ID de l'email
 * @returns {Promise<Object>} - Email mis à jour
 */
const markAsSent = async (db, emailId) => {
  try {
    const result = await db.pool.query(
      `UPDATE scheduled_emails
       SET status = 'sent',
           sent_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [emailId]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erreur markAsSent:', error);
    throw error;
  }
};

/**
 * Marque un email comme échoué
 * @param {Object} db - Instance de la base de données
 * @param {number} emailId - ID de l'email
 * @param {string} errorMessage - Message d'erreur
 * @returns {Promise<Object>} - Email mis à jour
 */
const markAsFailed = async (db, emailId, errorMessage) => {
  try {
    const result = await db.pool.query(
      `UPDATE scheduled_emails
       SET status = CASE
             WHEN retry_count + 1 >= max_retries THEN 'failed'
             ELSE 'pending'
           END,
           retry_count = retry_count + 1,
           error_message = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [emailId, errorMessage]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erreur markAsFailed:', error);
    throw error;
  }
};

/**
 * Annule un email programmé
 * @param {Object} db - Instance de la base de données
 * @param {number} emailId - ID de l'email
 * @returns {Promise<Object>} - Email annulé
 */
const cancelScheduledEmail = async (db, emailId) => {
  try {
    const result = await db.pool.query(
      `UPDATE scheduled_emails
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [emailId]
    );

    if (result.rows.length === 0) {
      throw new Error('Email non trouvé ou déjà traité');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Erreur cancelScheduledEmail:', error);
    throw error;
  }
};

/**
 * Récupère un email par son ID
 * @param {Object} db - Instance de la base de données
 * @param {number} emailId - ID de l'email
 * @returns {Promise<Object|null>} - Email ou null
 */
const getScheduledEmailById = async (db, emailId) => {
  try {
    const result = await db.pool.query(
      'SELECT * FROM scheduled_emails WHERE id = $1',
      [emailId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Erreur getScheduledEmailById:', error);
    throw error;
  }
};

/**
 * Récupère tous les emails programmés (avec filtres et pagination)
 * @param {Object} db - Instance de la base de données
 * @param {Object} options - Options de filtrage
 * @returns {Promise<Object>} - Liste et total
 */
const getAllScheduledEmails = async (db, options = {}) => {
  try {
    const {
      status = null,
      email_type = null,
      related_type = null,
      related_id = null,
      limit = 50,
      offset = 0
    } = options;

    let query = 'SELECT * FROM scheduled_emails WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (email_type) {
      query += ` AND email_type = $${paramIndex++}`;
      params.push(email_type);
    }

    if (related_type) {
      query += ` AND related_type = $${paramIndex++}`;
      params.push(related_type);
    }

    if (related_id) {
      query += ` AND related_id = $${paramIndex++}`;
      params.push(related_id);
    }

    // Count total
    const countResult = await db.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    query += ` ORDER BY scheduled_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.pool.query(query, params);

    return {
      emails: result.rows,
      total,
      limit,
      offset
    };
  } catch (error) {
    console.error('Erreur getAllScheduledEmails:', error);
    throw error;
  }
};

/**
 * Récupère les emails programmés pour un élément lié
 * @param {Object} db - Instance de la base de données
 * @param {string} relatedType - Type de l'élément (client, invoice, quote, etc.)
 * @param {number} relatedId - ID de l'élément
 * @returns {Promise<Array>} - Liste des emails
 */
const getScheduledEmailsByRelated = async (db, relatedType, relatedId) => {
  try {
    const result = await db.pool.query(
      `SELECT * FROM scheduled_emails
       WHERE related_type = $1 AND related_id = $2
       ORDER BY scheduled_at DESC`,
      [relatedType, relatedId]
    );

    return result.rows;
  } catch (error) {
    console.error('Erreur getScheduledEmailsByRelated:', error);
    throw error;
  }
};

/**
 * Met à jour un email programmé (avant envoi uniquement)
 * @param {Object} db - Instance de la base de données
 * @param {number} emailId - ID de l'email
 * @param {Object} updates - Champs à mettre à jour
 * @returns {Promise<Object>} - Email mis à jour
 */
const updateScheduledEmail = async (db, emailId, updates) => {
  try {
    // Vérifier que l'email est toujours en attente
    const existing = await getScheduledEmailById(db, emailId);
    if (!existing) {
      throw new Error('Email non trouvé');
    }
    if (existing.status !== 'pending') {
      throw new Error('Impossible de modifier un email déjà traité');
    }

    const allowedFields = [
      'to_email', 'to_name', 'cc_email', 'subject', 'body_html', 'body_text',
      'attachments', 'scheduled_at', 'timezone', 'notes'
    ];

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex++}`);
        params.push(field === 'attachments' ? JSON.stringify(updates[field]) : updates[field]);
      }
    }

    if (setClauses.length === 0) {
      return existing;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(emailId);

    const result = await db.pool.query(
      `UPDATE scheduled_emails SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erreur updateScheduledEmail:', error);
    throw error;
  }
};

/**
 * Supprime un email programmé (uniquement si pending ou cancelled)
 * @param {Object} db - Instance de la base de données
 * @param {number} emailId - ID de l'email
 * @returns {Promise<boolean>} - true si supprimé
 */
const deleteScheduledEmail = async (db, emailId) => {
  try {
    const result = await db.pool.query(
      `DELETE FROM scheduled_emails
       WHERE id = $1 AND status IN ('pending', 'cancelled')
       RETURNING id`,
      [emailId]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Erreur deleteScheduledEmail:', error);
    throw error;
  }
};

/**
 * Récupère les statistiques des emails programmés
 * @param {Object} db - Instance de la base de données
 * @returns {Promise<Object>} - Statistiques
 */
const getScheduledEmailStats = async (db) => {
  try {
    const result = await db.pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'pending' AND scheduled_at <= NOW() THEN 1 ELSE 0 END) as ready_to_send
      FROM scheduled_emails
    `);

    return {
      total: parseInt(result.rows[0].total) || 0,
      pending: parseInt(result.rows[0].pending) || 0,
      sent: parseInt(result.rows[0].sent) || 0,
      failed: parseInt(result.rows[0].failed) || 0,
      cancelled: parseInt(result.rows[0].cancelled) || 0,
      ready_to_send: parseInt(result.rows[0].ready_to_send) || 0
    };
  } catch (error) {
    console.error('Erreur getScheduledEmailStats:', error);
    throw error;
  }
};

/**
 * Récupère les prochains emails programmés
 * @param {Object} db - Instance de la base de données
 * @param {number} limit - Nombre d'emails
 * @returns {Promise<Array>} - Liste des prochains emails
 */
const getUpcomingEmails = async (db, limit = 10) => {
  try {
    const result = await db.pool.query(
      `SELECT *
       FROM scheduled_emails
       WHERE status = 'pending' AND scheduled_at > NOW()
       ORDER BY scheduled_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Erreur getUpcomingEmails:', error);
    throw error;
  }
};

module.exports = {
  createScheduledEmail,
  getEmailsReadyToSend,
  markAsSent,
  markAsFailed,
  cancelScheduledEmail,
  getScheduledEmailById,
  getAllScheduledEmails,
  getScheduledEmailsByRelated,
  updateScheduledEmail,
  deleteScheduledEmail,
  getScheduledEmailStats,
  getUpcomingEmails
};
