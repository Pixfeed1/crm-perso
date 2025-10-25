// backend/scripts/createClientsTable.js
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

// Fonction principale pour créer la table crm_clients
async function createClientsTable() {
  const client = await pgPool.connect();

  try {
    console.log('Démarrage de la création de la table crm_clients...');

    // Vérifier si la table existe déjà
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'crm_clients'
      );
    `;

    const tableExistsResult = await client.query(tableExistsQuery);

    if (tableExistsResult.rows[0].exists) {
      console.log('✅ La table crm_clients existe déjà dans PostgreSQL.');
      return;
    }

    // Créer la table crm_clients
    const createTableQuery = `
      CREATE TABLE crm_clients (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER,
        name TEXT NOT NULL,
        company TEXT,
        type TEXT DEFAULT 'individual',
        email TEXT,
        phone TEXT,
        address TEXT,
        website TEXT,
        industry TEXT,
        source TEXT,
        contract_start_date TIMESTAMP,
        lifetime_value NUMERIC DEFAULT 0,
        notes TEXT,
        tags TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
      );
    `;

    await client.query(createTableQuery);
    console.log('✅ Table crm_clients créée avec succès.');

    // Créer des index pour améliorer les performances
    console.log('Création des index...');

    const indexes = [
      'CREATE INDEX idx_clients_status ON crm_clients(status);',
      'CREATE INDEX idx_clients_type ON crm_clients(type);',
      'CREATE INDEX idx_clients_lead_id ON crm_clients(lead_id);',
      'CREATE INDEX idx_clients_email ON crm_clients(email);',
      'CREATE INDEX idx_clients_name ON crm_clients(name);'
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }

    console.log('✅ Index créés avec succès.');
    console.log('🎉 Migration de la table crm_clients terminée avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de la création de la table crm_clients:', error);
    throw error;
  } finally {
    client.release();
    // Ne fermer le pool que si le script est exécuté directement (pas en tant que module)
    if (require.main === module) {
      await pgPool.end();
      console.log('Connexion PostgreSQL fermée.');
    }
  }
}

// Exécuter la migration
if (require.main === module) {
  createClientsTable()
    .then(() => {
      console.log('✅ Script de migration terminé.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { createClientsTable };
