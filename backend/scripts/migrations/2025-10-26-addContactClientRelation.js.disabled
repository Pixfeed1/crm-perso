// backend/scripts/migrations/addContactClientRelation.js

/**
 * Migration: Ajouter la relation contact -> client
 *
 * Permet à un contact (personne travaillant dans une entreprise lead)
 * d'avoir aussi un profil client particulier pour ses propres besoins.
 *
 * Exemple: Jean Dupont travaille chez Acme Corp (lead), mais peut aussi
 * être client particulier pour commander des services à titre personnel.
 */

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'crm_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Démarrage de la migration: addContactClientRelation');

    // Vérifier si la colonne existe déjà
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'contacts'
      AND column_name = 'client_id';
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✓ La colonne client_id existe déjà dans contacts');
      return;
    }

    // Ajouter la colonne client_id avec contrainte de clé étrangère
    console.log('Ajout de la colonne client_id à la table contacts...');
    await client.query(`
      ALTER TABLE contacts
      ADD COLUMN client_id INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL;
    `);
    console.log('✅ Colonne client_id ajoutée');

    // Créer un index pour optimiser les recherches
    console.log('Création de l\'index sur client_id...');
    await client.query(`
      CREATE INDEX idx_contacts_client_id ON contacts(client_id);
    `);
    console.log('✅ Index créé');

    console.log('✅ Migration terminée avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécuter la migration si appelé directement
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration complète.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Échec de la migration:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
