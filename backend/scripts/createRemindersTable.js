// backend/scripts/createRemindersTable.js
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

// Paramètres PostgreSQL
const pgConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  port: process.env.DB_PORT || 5432,
};

// Connexion à PostgreSQL
const pgPool = new Pool(pgConfig);

// Fonction principale pour créer la table reminders
async function createRemindersTable() {
  const client = await pgPool.connect();

  try {
    console.log('Démarrage de la création de la table reminders...');

    // Vérifier si la table existe déjà
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'reminders'
      );
    `;

    const tableExistsResult = await client.query(tableExistsQuery);

    if (tableExistsResult.rows[0].exists) {
      console.log('La table reminders existe déjà dans PostgreSQL.');
      return;
    }

    // Créer la table reminders
    const createTableQuery = `
      CREATE TABLE reminders (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date TIMESTAMP NOT NULL,
        priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        dismissed_at TIMESTAMP
      );
    `;

    await client.query(createTableQuery);
    console.log('✅ Table reminders créée avec succès.');

    // Créer des index pour améliorer les performances
    console.log('Création des index...');

    const indexes = [
      'CREATE INDEX idx_reminders_status ON reminders(status);',
      'CREATE INDEX idx_reminders_due_date ON reminders(due_date);',
      'CREATE INDEX idx_reminders_entity ON reminders(entity_type, entity_id);',
      'CREATE INDEX idx_reminders_priority ON reminders(priority);'
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }

    console.log('✅ Index créés avec succès.');
    console.log('🎉 Migration de la table reminders terminée avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de la création de la table reminders:', error);
    throw error;
  } finally {
    client.release();
    await pgPool.end();
    console.log('Connexion PostgreSQL fermée.');
  }
}

// Exécuter la migration
if (require.main === module) {
  createRemindersTable()
    .then(() => {
      console.log('✅ Script de migration terminé.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { createRemindersTable };
