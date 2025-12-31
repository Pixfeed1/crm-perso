// backend/controllers/interventionController.js

/**
 * Contrôleur pour la gestion des interventions de maintenance
 */

/**
 * Récupérer toutes les interventions d'un projet
 */
const getInterventionsByProject = async (req, res) => {
  const db = req.app.locals.db;
  const { projectId } = req.params;

  try {
    const query = `
      SELECT * FROM interventions
      WHERE project_id = $1
      ORDER BY scheduled_date DESC, created_at DESC
    `;

    const result = await db.pool.query(query, [projectId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des interventions:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Récupérer une intervention par ID
 */
const getInterventionById = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const query = `SELECT * FROM interventions WHERE id = $1`;
    const result = await db.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Intervention non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'intervention:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Créer une nouvelle intervention
 */
const createIntervention = async (req, res) => {
  const db = req.app.locals.db;
  const { projectId } = req.params;
  const {
    title,
    description,
    type = 'maintenance',
    status = 'planned',
    priority = 'normal',
    scheduled_date,
    duration_minutes,
    technician,
    notes
  } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Le titre est requis' });
  }

  try {
    const query = `
      INSERT INTO interventions (
        project_id, title, description, type, status, priority,
        scheduled_date, duration_minutes, technician, notes,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `;

    const result = await db.pool.query(query, [
      projectId,
      title,
      description || null,
      type,
      status,
      priority,
      scheduled_date || null,
      duration_minutes || null,
      technician || null,
      notes || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la création de l\'intervention:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Mettre à jour une intervention
 */
const updateIntervention = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const {
    title,
    description,
    type,
    status,
    priority,
    scheduled_date,
    completed_date,
    duration_minutes,
    technician,
    notes
  } = req.body;

  try {
    // Vérifier que l'intervention existe
    const checkQuery = `SELECT * FROM interventions WHERE id = $1`;
    const checkResult = await db.pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Intervention non trouvée' });
    }

    // Construire la requête de mise à jour dynamique
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      params.push(type);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);

      // Si le statut passe à "completed", ajouter la date de complétion
      if (status === 'completed' && !completed_date) {
        updates.push(`completed_date = $${paramIndex++}`);
        params.push(new Date().toISOString());
      }
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    if (scheduled_date !== undefined) {
      updates.push(`scheduled_date = $${paramIndex++}`);
      params.push(scheduled_date);
    }
    if (completed_date !== undefined) {
      updates.push(`completed_date = $${paramIndex++}`);
      params.push(completed_date);
    }
    if (duration_minutes !== undefined) {
      updates.push(`duration_minutes = $${paramIndex++}`);
      params.push(duration_minutes);
    }
    if (technician !== undefined) {
      updates.push(`technician = $${paramIndex++}`);
      params.push(technician);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    params.push(id);

    const query = `
      UPDATE interventions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.pool.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'intervention:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Supprimer une intervention
 */
const deleteIntervention = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const query = `DELETE FROM interventions WHERE id = $1 RETURNING *`;
    const result = await db.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Intervention non trouvée' });
    }

    res.json({ message: 'Intervention supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'intervention:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Récupérer les statistiques des interventions d'un projet
 */
const getInterventionStats = async (req, res) => {
  const db = req.app.locals.db;
  const { projectId } = req.params;

  try {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'planned' THEN 1 END) as planned,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN duration_minutes ELSE 0 END) as total_duration
      FROM interventions
      WHERE project_id = $1
    `;

    const result = await db.pool.query(query, [projectId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération des stats:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getInterventionsByProject,
  getInterventionById,
  createIntervention,
  updateIntervention,
  deleteIntervention,
  getInterventionStats
};
