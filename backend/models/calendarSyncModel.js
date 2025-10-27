/**
 * Modèle pour la gestion de la synchronisation des calendriers
 */

/**
 * Crée ou met à jour une connexion de calendrier
 */
const upsertConnection = (db, connectionData) => {
  return new Promise((resolve, reject) => {
    const {
      user_id,
      provider,
      account_email,
      access_token,
      refresh_token,
      token_expiry,
      sync_enabled = true,
      sync_direction = 'bidirectional'
    } = connectionData;

    const query = `
      INSERT INTO calendar_connections (
        user_id, provider, account_email, access_token, refresh_token,
        token_expiry, sync_enabled, sync_direction, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, provider, account_email)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expiry = EXCLUDED.token_expiry,
        sync_enabled = EXCLUDED.sync_enabled,
        sync_direction = EXCLUDED.sync_direction,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    db.pool.query(
      query,
      [user_id, provider, account_email, access_token, refresh_token, token_expiry, sync_enabled, sync_direction],
      (err, result) => {
        if (err) {
          console.error('[CalendarSyncModel] Erreur lors de l\'upsert de connexion:', err);
          return reject(err);
        }
        resolve(result.rows[0]);
      }
    );
  });
};

/**
 * Récupère toutes les connexions d'un utilisateur
 */
const getUserConnections = (db, userId) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM calendar_connections WHERE user_id = $1 AND is_active = true';

    db.pool.query(query, [userId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la récupération des connexions:', err);
        return reject(err);
      }
      resolve(result.rows);
    });
  });
};

/**
 * Récupère une connexion spécifique
 */
const getConnectionById = (db, connectionId) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM calendar_connections WHERE id = $1';

    db.pool.query(query, [connectionId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la récupération de la connexion:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

/**
 * Met à jour les tokens d'une connexion
 */
const updateConnectionTokens = (db, connectionId, tokens) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE calendar_connections
      SET access_token = $1, refresh_token = $2, token_expiry = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    db.pool.query(
      query,
      [tokens.access_token, tokens.refresh_token, tokens.token_expiry, connectionId],
      (err, result) => {
        if (err) {
          console.error('[CalendarSyncModel] Erreur lors de la mise à jour des tokens:', err);
          return reject(err);
        }
        resolve(result.rows[0]);
      }
    );
  });
};

/**
 * Met à jour la date de dernière synchronisation
 */
const updateLastSync = (db, connectionId) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE calendar_connections
      SET last_sync_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    db.pool.query(query, [connectionId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la mise à jour de last_sync_at:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

/**
 * Désactive une connexion
 */
const deactivateConnection = (db, connectionId) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE calendar_connections
      SET is_active = false, sync_enabled = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    db.pool.query(query, [connectionId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la désactivation de la connexion:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

/**
 * Crée un mapping entre un événement interne et un événement externe
 */
const createEventMapping = (db, mappingData) => {
  return new Promise((resolve, reject) => {
    const {
      connection_id,
      internal_event_id,
      external_event_id,
      external_calendar_id
    } = mappingData;

    const query = `
      INSERT INTO event_mappings (
        connection_id, internal_event_id, external_event_id, external_calendar_id
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (connection_id, external_event_id)
      DO UPDATE SET
        internal_event_id = EXCLUDED.internal_event_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    db.pool.query(
      query,
      [connection_id, internal_event_id, external_event_id, external_calendar_id],
      (err, result) => {
        if (err) {
          console.error('[CalendarSyncModel] Erreur lors de la création du mapping:', err);
          return reject(err);
        }
        resolve(result.rows[0]);
      }
    );
  });
};

/**
 * Récupère le mapping pour un événement interne
 */
const getMappingByInternalEvent = (db, internalEventId, connectionId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM event_mappings
      WHERE internal_event_id = $1 AND connection_id = $2
    `;

    db.pool.query(query, [internalEventId, connectionId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la récupération du mapping:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

/**
 * Récupère le mapping pour un événement externe
 */
const getMappingByExternalEvent = (db, externalEventId, connectionId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM event_mappings
      WHERE external_event_id = $1 AND connection_id = $2
    `;

    db.pool.query(query, [externalEventId, connectionId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la récupération du mapping:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

/**
 * Supprime un mapping d'événement
 */
const deleteEventMapping = (db, internalEventId, connectionId) => {
  return new Promise((resolve, reject) => {
    const query = `
      DELETE FROM event_mappings
      WHERE internal_event_id = $1 AND connection_id = $2
      RETURNING *
    `;

    db.pool.query(query, [internalEventId, connectionId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la suppression du mapping:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

/**
 * Crée un log de synchronisation
 */
const createSyncLog = (db, logData) => {
  return new Promise((resolve, reject) => {
    const {
      connection_id,
      sync_type,
      sync_direction
    } = logData;

    const query = `
      INSERT INTO calendar_sync_logs (connection_id, sync_type, sync_direction, status)
      VALUES ($1, $2, $3, 'running')
      RETURNING *
    `;

    db.pool.query(query, [connection_id, sync_type, sync_direction], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la création du log:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

/**
 * Met à jour un log de synchronisation
 */
const updateSyncLog = (db, logId, updateData) => {
  return new Promise((resolve, reject) => {
    const {
      status,
      events_imported = 0,
      events_exported = 0,
      events_updated = 0,
      events_deleted = 0,
      error_count = 0,
      error_details
    } = updateData;

    const query = `
      UPDATE calendar_sync_logs
      SET
        completed_at = CURRENT_TIMESTAMP,
        status = $1,
        events_imported = $2,
        events_exported = $3,
        events_updated = $4,
        events_deleted = $5,
        error_count = $6,
        error_details = $7
      WHERE id = $8
      RETURNING *
    `;

    db.pool.query(
      query,
      [status, events_imported, events_exported, events_updated, events_deleted, error_count, error_details, logId],
      (err, result) => {
        if (err) {
          console.error('[CalendarSyncModel] Erreur lors de la mise à jour du log:', err);
          return reject(err);
        }
        resolve(result.rows[0]);
      }
    );
  });
};

/**
 * Récupère les logs de synchronisation pour une connexion
 */
const getSyncLogs = (db, connectionId, limit = 10) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM calendar_sync_logs
      WHERE connection_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `;

    db.pool.query(query, [connectionId, limit], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la récupération des logs:', err);
        return reject(err);
      }
      resolve(result.rows);
    });
  });
};

/**
 * Crée ou met à jour les préférences de synchronisation
 */
const upsertSyncPreferences = (db, preferencesData) => {
  return new Promise((resolve, reject) => {
    const {
      connection_id,
      auto_sync_enabled = false,
      sync_interval_minutes = 15,
      sync_past_days = 30,
      sync_future_days = 90,
      sync_categories,
      conflict_resolution = 'manual',
      notifications_enabled = true
    } = preferencesData;

    const query = `
      INSERT INTO calendar_sync_preferences (
        connection_id, auto_sync_enabled, sync_interval_minutes,
        sync_past_days, sync_future_days, sync_categories,
        conflict_resolution, notifications_enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (connection_id)
      DO UPDATE SET
        auto_sync_enabled = EXCLUDED.auto_sync_enabled,
        sync_interval_minutes = EXCLUDED.sync_interval_minutes,
        sync_past_days = EXCLUDED.sync_past_days,
        sync_future_days = EXCLUDED.sync_future_days,
        sync_categories = EXCLUDED.sync_categories,
        conflict_resolution = EXCLUDED.conflict_resolution,
        notifications_enabled = EXCLUDED.notifications_enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    db.pool.query(
      query,
      [connection_id, auto_sync_enabled, sync_interval_minutes, sync_past_days, sync_future_days, sync_categories, conflict_resolution, notifications_enabled],
      (err, result) => {
        if (err) {
          console.error('[CalendarSyncModel] Erreur lors de la mise à jour des préférences:', err);
          return reject(err);
        }
        resolve(result.rows[0]);
      }
    );
  });
};

/**
 * Récupère les préférences de synchronisation
 */
const getSyncPreferences = (db, connectionId) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM calendar_sync_preferences WHERE connection_id = $1';

    db.pool.query(query, [connectionId], (err, result) => {
      if (err) {
        console.error('[CalendarSyncModel] Erreur lors de la récupération des préférences:', err);
        return reject(err);
      }
      resolve(result.rows[0]);
    });
  });
};

module.exports = {
  upsertConnection,
  getUserConnections,
  getConnectionById,
  updateConnectionTokens,
  updateLastSync,
  deactivateConnection,
  createEventMapping,
  getMappingByInternalEvent,
  getMappingByExternalEvent,
  deleteEventMapping,
  createSyncLog,
  updateSyncLog,
  getSyncLogs,
  upsertSyncPreferences,
  getSyncPreferences
};
