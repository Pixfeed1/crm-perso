/**
 * Migration pour les paramètres de visioconférence
 * Ajoute les préférences utilisateur pour la génération automatique de liens
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
    console.log('🚀 Début de la migration : Paramètres de visioconférence\n');

    await client.query('BEGIN');

    // 1. Créer la table des préférences de visioconférence
    console.log('1. Création de la table video_conference_settings...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS video_conference_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

        -- Provider par défaut
        default_provider VARCHAR(20) NOT NULL DEFAULT 'google_meet',

        -- Auto-génération de liens
        auto_generate BOOLEAN DEFAULT false,

        -- Google Meet (via Calendar API)
        google_meet_enabled BOOLEAN DEFAULT false,
        google_calendar_id VARCHAR(255),

        -- Zoom
        zoom_enabled BOOLEAN DEFAULT false,
        zoom_api_key TEXT,
        zoom_api_secret TEXT,
        zoom_user_id VARCHAR(255),

        -- Microsoft Teams
        teams_enabled BOOLEAN DEFAULT false,
        teams_tenant_id VARCHAR(255),

        -- Paramètres par défaut des réunions
        default_duration INTEGER DEFAULT 60,
        default_join_before_host BOOLEAN DEFAULT true,
        default_waiting_room BOOLEAN DEFAULT false,
        default_recording BOOLEAN DEFAULT false,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(user_id)
      );
    `);
    console.log('✓ Table video_conference_settings créée');

    // 2. Ajouter la colonne video_link dans la table events si elle n'existe pas
    console.log('2. Ajout de la colonne video_link dans events...');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'video_link'
        ) THEN
          ALTER TABLE events ADD COLUMN video_link TEXT;
        END IF;
      END $$;
    `);
    console.log('✓ Colonne video_link ajoutée');

    // 3. Ajouter la colonne video_provider dans la table events
    console.log('3. Ajout de la colonne video_provider dans events...');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'video_provider'
        ) THEN
          ALTER TABLE events ADD COLUMN video_provider VARCHAR(20);
        END IF;
      END $$;
    `);
    console.log('✓ Colonne video_provider ajoutée');

    // 4. Ajouter la colonne video_meeting_id dans la table events
    console.log('4. Ajout de la colonne video_meeting_id dans events...');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'video_meeting_id'
        ) THEN
          ALTER TABLE events ADD COLUMN video_meeting_id VARCHAR(255);
        END IF;
      END $$;
    `);
    console.log('✓ Colonne video_meeting_id ajoutée');

    // 5. Créer des index pour les performances
    console.log('5. Création des index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_video_settings_user
      ON video_conference_settings(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_events_video_provider
      ON events(video_provider);
    `);
    console.log('✓ Index créés\n');

    await client.query('COMMIT');

    console.log('═'.repeat(60));
    console.log('✅ Migration terminée avec succès');
    console.log('✅ Préférences de visioconférence configurables');
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
