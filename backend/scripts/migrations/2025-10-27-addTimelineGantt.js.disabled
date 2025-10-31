/**
 * Migration pour la vue Timeline/Gantt
 * Ajoute les dépendances entre événements et métadonnées pour la visualisation
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
    console.log('🚀 Début de la migration : Vue Timeline/Gantt\n');

    await client.query('BEGIN');

    // 1. Créer la table des dépendances entre événements
    console.log('1. Création de la table event_dependencies...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS event_dependencies (
        id SERIAL PRIMARY KEY,
        source_event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        target_event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        dependency_type VARCHAR(20) NOT NULL DEFAULT 'finish_to_start',
        lag_days INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_event_id, target_event_id),
        CHECK (source_event_id != target_event_id)
      );
    `);
    console.log('✓ Table event_dependencies créée');

    // 2. Ajouter des colonnes métadonnées pour les événements
    console.log('2. Ajout des colonnes métadonnées dans events...');

    // Colonne pour le projet/groupe
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'project_id'
        ) THEN
          ALTER TABLE events ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    console.log('✓ Colonne project_id ajoutée');

    // Colonne pour le statut d'avancement (0-100%)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'completion_percentage'
        ) THEN
          ALTER TABLE events ADD COLUMN completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100);
        END IF;
      END $$;
    `);
    console.log('✓ Colonne completion_percentage ajoutée');

    // Colonne pour le groupe/swimlane
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'swimlane'
        ) THEN
          ALTER TABLE events ADD COLUMN swimlane VARCHAR(100);
        END IF;
      END $$;
    `);
    console.log('✓ Colonne swimlane ajoutée');

    // Colonne pour la couleur spécifique timeline
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'timeline_color'
        ) THEN
          ALTER TABLE events ADD COLUMN timeline_color VARCHAR(7);
        END IF;
      END $$;
    `);
    console.log('✓ Colonne timeline_color ajoutée');

    // Colonne pour marquer comme jalon (milestone)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'events' AND column_name = 'is_milestone'
        ) THEN
          ALTER TABLE events ADD COLUMN is_milestone BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('✓ Colonne is_milestone ajoutée');

    // 3. Créer des index pour les performances
    console.log('3. Création des index...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_event_dependencies_source
      ON event_dependencies(source_event_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_event_dependencies_target
      ON event_dependencies(target_event_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_events_project
      ON events(project_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_events_swimlane
      ON events(swimlane);
    `);

    console.log('✓ Index créés\n');

    // 4. Créer une vue pour récupérer les événements avec leurs dépendances
    console.log('4. Création de la vue timeline_events...');

    await client.query(`
      CREATE OR REPLACE VIEW timeline_events AS
      SELECT
        e.*,
        json_agg(
          json_build_object(
            'id', ed.id,
            'target_event_id', ed.target_event_id,
            'dependency_type', ed.dependency_type,
            'lag_days', ed.lag_days
          )
        ) FILTER (WHERE ed.id IS NOT NULL) as dependencies
      FROM events e
      LEFT JOIN event_dependencies ed ON e.id = ed.source_event_id
      GROUP BY e.id;
    `);
    console.log('✓ Vue timeline_events créée\n');

    await client.query('COMMIT');

    console.log('═'.repeat(60));
    console.log('✅ Migration terminée avec succès');
    console.log('✅ Vue Timeline/Gantt disponible');
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
