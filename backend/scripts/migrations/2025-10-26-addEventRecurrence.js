/**
 * Migration pour ajouter la gestion des événements récurrents
 * Conforme à la norme RFC 5545 (iCalendar)
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
    console.log('🚀 Début de la migration : Événements récurrents\n');

    await client.query('BEGIN');

    // 1. Ajouter les colonnes de récurrence à la table events
    console.log('1. Ajout des colonnes de récurrence à la table events...');

    const columns = [
      {
        name: 'recurrence_type',
        type: "VARCHAR(20) DEFAULT 'NONE'",
        description: 'Type de récurrence : NONE, DAILY, WEEKLY, MONTHLY, YEARLY'
      },
      {
        name: 'recurrence_interval',
        type: 'INTEGER DEFAULT 1',
        description: 'Intervalle de récurrence (ex: tous les 2 jours)'
      },
      {
        name: 'recurrence_days',
        type: 'VARCHAR(50)',
        description: 'Jours de la semaine pour récurrence hebdomadaire (ex: "1,3,5" pour lun/mer/ven)'
      },
      {
        name: 'recurrence_end_type',
        type: "VARCHAR(20) DEFAULT 'NEVER'",
        description: 'Type de fin : NEVER, COUNT, DATE'
      },
      {
        name: 'recurrence_end_date',
        type: 'TIMESTAMP',
        description: 'Date de fin de la récurrence'
      },
      {
        name: 'recurrence_count',
        type: 'INTEGER',
        description: 'Nombre d\'occurrences (si end_type = COUNT)'
      },
      {
        name: 'recurrence_rule',
        type: 'TEXT',
        description: 'RRULE complète au format iCalendar (pour compatibilité externe)'
      },
      {
        name: 'parent_event_id',
        type: 'INTEGER',
        description: 'ID de l\'événement parent si c\'est une exception'
      },
      {
        name: 'is_exception',
        type: 'BOOLEAN DEFAULT false',
        description: 'True si c\'est une modification d\'une occurrence spécifique'
      },
      {
        name: 'exception_date',
        type: 'TIMESTAMP',
        description: 'Date originale de l\'occurrence modifiée/supprimée'
      }
    ];

    for (const col of columns) {
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

    // 2. Ajouter une contrainte de clé étrangère pour parent_event_id
    console.log('\n2. Ajout de la contrainte de clé étrangère...');

    const constraintExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_constraint
        WHERE conname = 'fk_events_parent_event'
      );
    `);

    if (!constraintExists.rows[0].exists) {
      await client.query(`
        ALTER TABLE events
        ADD CONSTRAINT fk_events_parent_event
        FOREIGN KEY (parent_event_id) REFERENCES events(id) ON DELETE CASCADE;
      `);
      console.log('  ✓ Contrainte fk_events_parent_event ajoutée');
    } else {
      console.log('  ⊘ Contrainte fk_events_parent_event existe déjà');
    }

    // 3. Créer des index pour optimiser les recherches
    console.log('\n3. Création des index...');

    const indexes = [
      { name: 'idx_events_recurrence_type', column: 'recurrence_type' },
      { name: 'idx_events_parent_event_id', column: 'parent_event_id' },
      { name: 'idx_events_is_exception', column: 'is_exception' },
      { name: 'idx_events_exception_date', column: 'exception_date' }
    ];

    for (const idx of indexes) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${idx.name} ON events(${idx.column});
      `);
      console.log(`  ✓ Index ${idx.name} créé`);
    }

    // 4. Créer une table pour stocker les exceptions (occurrences supprimées)
    console.log('\n4. Création de la table event_exceptions...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS event_exceptions (
        id SERIAL PRIMARY KEY,
        parent_event_id INTEGER NOT NULL,
        exception_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_event_id) REFERENCES events(id) ON DELETE CASCADE
      );
    `);
    console.log('  ✓ Table event_exceptions créée');

    // Index pour event_exceptions
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_event_exceptions_parent
      ON event_exceptions(parent_event_id);
    `);
    console.log('  ✓ Index idx_event_exceptions_parent créé');

    await client.query('COMMIT');

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Migration terminée avec succès');
    console.log('✅ Les événements récurrents sont maintenant supportés');
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

module.exports = runMigration;
