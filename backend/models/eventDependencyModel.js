/**
 * Modèle pour gérer les dépendances entre événements (Timeline/Gantt)
 */

/**
 * Crée une dépendance entre deux événements
 */
async function createDependency(db, sourceEventId, targetEventId, dependencyType = 'finish_to_start', lagDays = 0) {
  try {
    const result = await db.pool.query(
      `INSERT INTO event_dependencies (source_event_id, target_event_id, dependency_type, lag_days)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sourceEventId, targetEventId, dependencyType, lagDays]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erreur lors de la création de la dépendance:', error);
    throw error;
  }
}

/**
 * Récupère toutes les dépendances d'un événement
 */
async function getEventDependencies(db, eventId) {
  try {
    // Dépendances sortantes (cet événement bloque d'autres)
    const outgoing = await db.pool.query(
      `SELECT ed.*, e.title as target_title, e.start_datetime, e.end_datetime
       FROM event_dependencies ed
       JOIN events e ON ed.target_event_id = e.id
       WHERE ed.source_event_id = $1`,
      [eventId]
    );

    // Dépendances entrantes (cet événement est bloqué par d'autres)
    const incoming = await db.pool.query(
      `SELECT ed.*, e.title as source_title, e.start_datetime, e.end_datetime
       FROM event_dependencies ed
       JOIN events e ON ed.source_event_id = e.id
       WHERE ed.target_event_id = $1`,
      [eventId]
    );

    return {
      outgoing: outgoing.rows,
      incoming: incoming.rows
    };
  } catch (error) {
    console.error('Erreur lors de la récupération des dépendances:', error);
    throw error;
  }
}

/**
 * Récupère toutes les dépendances pour une liste d'événements
 */
async function getAllDependencies(db, eventIds = null) {
  try {
    let query = `
      SELECT ed.*,
             es.title as source_title,
             et.title as target_title
      FROM event_dependencies ed
      JOIN events es ON ed.source_event_id = es.id
      JOIN events et ON ed.target_event_id = et.id
    `;

    let params = [];

    if (eventIds && eventIds.length > 0) {
      query += ` WHERE ed.source_event_id = ANY($1) OR ed.target_event_id = ANY($1)`;
      params = [eventIds];
    }

    const result = await db.pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Erreur lors de la récupération de toutes les dépendances:', error);
    throw error;
  }
}

/**
 * Met à jour une dépendance
 */
async function updateDependency(db, dependencyId, updates) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(dependencyId);

    const query = `
      UPDATE event_dependencies
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Dépendance introuvable');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la dépendance:', error);
    throw error;
  }
}

/**
 * Supprime une dépendance
 */
async function deleteDependency(db, dependencyId) {
  try {
    const result = await db.pool.query(
      'DELETE FROM event_dependencies WHERE id = $1 RETURNING *',
      [dependencyId]
    );

    if (result.rows.length === 0) {
      throw new Error('Dépendance introuvable');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Erreur lors de la suppression de la dépendance:', error);
    throw error;
  }
}

/**
 * Vérifie s'il y a des dépendances circulaires
 */
async function checkCircularDependency(db, sourceEventId, targetEventId) {
  try {
    // Utiliser une requête récursive pour détecter les cycles
    const result = await db.pool.query(
      `WITH RECURSIVE dependency_chain AS (
        -- Départ: la nouvelle dépendance proposée
        SELECT target_event_id as event_id, 1 as depth
        FROM (SELECT $2 as target_event_id) AS start

        UNION

        -- Récursion: suivre la chaîne de dépendances
        SELECT ed.target_event_id, dc.depth + 1
        FROM dependency_chain dc
        JOIN event_dependencies ed ON dc.event_id = ed.source_event_id
        WHERE dc.depth < 100 -- Limite de sécurité
      )
      SELECT EXISTS(
        SELECT 1 FROM dependency_chain WHERE event_id = $1
      ) as has_cycle`,
      [sourceEventId, targetEventId]
    );

    return result.rows[0].has_cycle;
  } catch (error) {
    console.error('Erreur lors de la vérification des dépendances circulaires:', error);
    throw error;
  }
}

/**
 * Calcule l'ordre topologique des événements
 */
async function getTopologicalOrder(db, eventIds) {
  try {
    // Algorithme de tri topologique (Kahn's algorithm)
    const result = await db.pool.query(
      `WITH RECURSIVE topological_sort AS (
        -- Trouver les événements sans dépendances entrantes
        SELECT e.id, e.title, e.start_datetime, 0 as level
        FROM events e
        WHERE e.id = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM event_dependencies ed
            WHERE ed.target_event_id = e.id
              AND ed.source_event_id = ANY($1)
          )

        UNION

        -- Ajouter les événements dont toutes les dépendances sont résolues
        SELECT e.id, e.title, e.start_datetime, ts.level + 1
        FROM events e
        JOIN event_dependencies ed ON e.id = ed.target_event_id
        JOIN topological_sort ts ON ed.source_event_id = ts.id
        WHERE e.id = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM event_dependencies ed2
            WHERE ed2.target_event_id = e.id
              AND ed2.source_event_id = ANY($1)
              AND ed2.source_event_id NOT IN (SELECT id FROM topological_sort)
          )
      )
      SELECT DISTINCT ON (id) *
      FROM topological_sort
      ORDER BY id, level DESC`,
      [eventIds]
    );

    return result.rows;
  } catch (error) {
    console.error('Erreur lors du calcul de l\'ordre topologique:', error);
    throw error;
  }
}

/**
 * Récupère les événements avec leurs dépendances pour la vue timeline
 */
async function getTimelineEvents(db, filters = {}) {
  try {
    let query = 'SELECT * FROM timeline_events WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filtres
    if (filters.start_date && filters.end_date) {
      query += ` AND start_datetime >= $${paramIndex} AND end_datetime <= $${paramIndex + 1}`;
      params.push(filters.start_date, filters.end_date);
      paramIndex += 2;
    }

    if (filters.project_id) {
      query += ` AND project_id = $${paramIndex}`;
      params.push(filters.project_id);
      paramIndex++;
    }

    if (filters.swimlane) {
      query += ` AND swimlane = $${paramIndex}`;
      params.push(filters.swimlane);
      paramIndex++;
    }

    query += ' ORDER BY start_datetime ASC';

    const result = await db.pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Erreur lors de la récupération des événements timeline:', error);
    throw error;
  }
}

/**
 * Met à jour les métadonnées timeline d'un événement
 */
async function updateEventTimelineData(db, eventId, timelineData) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['project_id', 'completion_percentage', 'swimlane', 'timeline_color', 'is_milestone'];

    for (const [key, value] of Object.entries(timelineData)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      throw new Error('Aucune donnée timeline valide à mettre à jour');
    }

    values.push(eventId);

    const query = `
      UPDATE events
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Événement introuvable');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Erreur lors de la mise à jour des données timeline:', error);
    throw error;
  }
}

module.exports = {
  createDependency,
  getEventDependencies,
  getAllDependencies,
  updateDependency,
  deleteDependency,
  checkCircularDependency,
  getTopologicalOrder,
  getTimelineEvents,
  updateEventTimelineData
};
