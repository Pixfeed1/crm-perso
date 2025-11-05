/**
 * Migration pour ajouter la synchronisation avec Google Calendar et Outlook
 * Permet l'import/export bidirectionnel et la synchronisation automatique
 */

const { Pool } = require('pg');

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm_db',
  });

  const client = await pool.connect();

  try {
    console.log('🚀 Début de la migration : Synchronisation calendriers\n');

    await client.query('BEGIN');

    // 1. Table calendar_connections - Connexions aux calendriers externes
    console.log('1. Création de la table calendar_connections...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS calendar_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'outlook')),
        account_email VARCHAR(255) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expiry TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        sync_enabled BOOLEAN DEFAULT true,
        sync_direction VARCHAR(20) DEFAULT 'bidirectional' CHECK (sync_direction IN ('import', 'export', 'bidirectional')),
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider, account_email)
      );
    `);
    console.log('  ✓ Table calendar_connections créée');

    // Index pour calendar_connections
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_connections_user
      ON calendar_connections(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_calendar_connections_provider
      ON calendar_connections(provider);
    `);
    console.log('  ✓ Index pour calendar_connections créés');

    // 2. Table event_mappings - Mapping entre événements internes et externes
    console.log('\n2. Création de la table event_mappings...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS event_mappings (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES calendar_connections(id) ON DELETE CASCADE,
        internal_event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        external_event_id VARCHAR(255) NOT NULL,
        external_calendar_id VARCHAR(255),
        last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error', 'conflict')),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(connection_id, external_event_id)
      );
    `);
    console.log('  ✓ Table event_mappings créée');

    // Index pour event_mappings
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_event_mappings_internal
      ON event_mappings(internal_event_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_event_mappings_external
      ON event_mappings(external_event_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_event_mappings_connection
      ON event_mappings(connection_id);
    `);
    console.log('  ✓ Index pour event_mappings créés');

    // 3. Table calendar_sync_logs - Historique des synchronisations
    console.log('\n3. Création de la table calendar_sync_logs...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS calendar_sync_logs (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES calendar_connections(id) ON DELETE CASCADE,
        sync_type VARCHAR(20) NOT NULL CHECK (sync_type IN ('manual', 'auto', 'import', 'export')),
        sync_direction VARCHAR(20) NOT NULL CHECK (sync_direction IN ('import', 'export', 'bidirectional')),
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'error')),
        events_imported INTEGER DEFAULT 0,
        events_exported INTEGER DEFAULT 0,
        events_updated INTEGER DEFAULT 0,
        events_deleted INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        error_details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ Table calendar_sync_logs créée');

    // Index pour calendar_sync_logs
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_logs_connection
      ON calendar_sync_logs(connection_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_logs_started
      ON calendar_sync_logs(started_at DESC);
    `);
    console.log('  ✓ Index pour calendar_sync_logs créés');

    // 4. Ajouter des colonnes aux événements pour la synchronisation
    console.log('\n4. Ajout de colonnes de synchronisation à la table events...');

    const eventColumns = [
      {
        name: 'is_synced',
        type: 'BOOLEAN DEFAULT false',
        description: 'Indique si l\'événement est synchronisé avec un calendrier externe'
      },
      {
        name: 'sync_source',
        type: "VARCHAR(20) CHECK (sync_source IN ('internal', 'google', 'outlook'))",
        description: 'Source de création de l\'événement'
      },
      {
        name: 'last_modified_by',
        type: "VARCHAR(20) DEFAULT 'internal' CHECK (last_modified_by IN ('internal', 'google', 'outlook'))",
        description: 'Dernière source de modification'
      },
      {
        name: 'last_synced_at',
        type: 'TIMESTAMP',
        description: 'Dernière synchronisation'
      }
    ];

    for (const col of eventColumns) {
      // Vérifier si la colonne existe déjà
      const columnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'events'
          AND column_name = $1
        );
      `, [col.name]);

      if (!columnExists.rows[0].exists) {
        await client.query(`ALTER TABLE events ADD COLUMN ${col.name} ${col.type};`);
        console.log(`  ✓ Colonne ${col.name} ajoutée`);
      } else {
        console.log(`  ⊘ Colonne ${col.name} existe déjà`);
      }
    }

    // 5. Créer une table pour les préférences de synchronisation
    console.log('\n5. Création de la table calendar_sync_preferences...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS calendar_sync_preferences (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES calendar_connections(id) ON DELETE CASCADE,
        auto_sync_enabled BOOLEAN DEFAULT false,
        sync_interval_minutes INTEGER DEFAULT 15,
        sync_past_days INTEGER DEFAULT 30,
        sync_future_days INTEGER DEFAULT 90,
        sync_categories TEXT[], -- Catégories d'événements à synchroniser
        conflict_resolution VARCHAR(20) DEFAULT 'manual' CHECK (conflict_resolution IN ('manual', 'local_wins', 'remote_wins', 'latest_wins')),
        notifications_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(connection_id)
      );
    `);
    console.log('  ✓ Table calendar_sync_preferences créée');

    await client.query('COMMIT');

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Migration terminée avec succès');
    console.log('✅ Les tables de synchronisation calendrier sont prêtes');
    console.log('═'.repeat(60));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécution de la migration
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\n✅ Migration exécutée avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Échec de la migration:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
