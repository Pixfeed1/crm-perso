// backend/scripts/migrateToPostgres.js
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
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

// Chemin vers la base de données SQLite
const sqliteDbPath = path.join(__dirname, '..', 'database.db');

// Connexion à la base de données SQLite
const sqliteDb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Erreur lors de la connexion à la base de données SQLite:', err.message);
    process.exit(1);
  }
  console.log('Connexion à la base de données SQLite établie.');
});

// Connexion à PostgreSQL
const pgPool = new Pool(pgConfig);

// Liste des tables à migrer
const tables = [
  'users',
  'leads',
  'projects',
  'activities',
  'tasks',
  'events',
  'revenues',
  'goals',
  'milestones'
];

// Fonction principale
async function migrateData() {
  try {
    console.log('Démarrage de la migration de données vers PostgreSQL...');
    
    // Parcourir toutes les tables
    for (const table of tables) {
      console.log(`Migration de la table ${table}...`);
      
      // Vérifier si la table existe dans SQLite
      const tableExists = await checkTableExists(table);
      
      if (!tableExists) {
        console.log(`La table ${table} n'existe pas dans la base de données SQLite, ignorée.`);
        continue;
      }
      
      // Obtenir toutes les données de la table SQLite
      const rows = await getTableData(table);
      
      if (rows.length === 0) {
        console.log(`Aucune donnée à migrer pour la table ${table}.`);
        continue;
      }
      
      console.log(`${rows.length} enregistrements trouvés dans la table ${table}.`);
      
      // Obtenir le schéma de la table dans PostgreSQL pour connaître les types de colonnes
      const pgColumns = await getPostgresColumns(table);
      
      // Migrer les données vers PostgreSQL
      await insertDataToPostgres(table, rows, pgColumns);
      
      console.log(`Migration de la table ${table} terminée.`);
    }
    
    console.log('Migration des données terminée avec succès!');
  } catch (error) {
    console.error('Erreur lors de la migration:', error);
  } finally {
    // Fermer les connexions
    sqliteDb.close();
    await pgPool.end();
    console.log('Connexions fermées.');
  }
}

// Vérifier si une table existe dans SQLite
function checkTableExists(tableName) {
  return new Promise((resolve, reject) => {
    sqliteDb.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      }
    );
  });
}

// Obtenir toutes les données d'une table SQLite
function getTableData(tableName) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT * FROM ${tableName}`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Obtenir les informations sur les colonnes PostgreSQL
async function getPostgresColumns(tableName) {
  const client = await pgPool.connect();
  try {
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 
      AND table_schema = 'public'
    `, [tableName]);
    
    const columnMap = {};
    result.rows.forEach(row => {
      columnMap[row.column_name] = row.data_type;
    });
    
    return columnMap;
  } catch (error) {
    console.error(`Erreur lors de la récupération du schéma pour ${tableName}:`, error);
    return {};
  } finally {
    client.release();
  }
}

// Insérer des données dans PostgreSQL
async function insertDataToPostgres(tableName, rows, pgColumns) {
  // Commencer une transaction
  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Désactiver les déclencheurs pour cette table
    await client.query(`ALTER TABLE ${tableName} DISABLE TRIGGER ALL`);
    
    // Pour chaque ligne
    for (const row of rows) {
      // Obtenir les noms des colonnes et les valeurs
      const columns = Object.keys(row);
      const values = Object.values(row);
      
      // Convertir les valeurs selon le type de colonne PostgreSQL
      const convertedValues = values.map((value, index) => {
        const columnName = columns[index];
        const pgType = pgColumns[columnName];
        
        // Conversion selon le type PostgreSQL
        if (pgType === 'integer' || pgType === 'bigint' || pgType === 'smallint') {
          // Pour les colonnes numériques
          if (value === 1 || value === true) return 1;
          if (value === 0 || value === false) return 0;
          if (value === null || value === undefined) return null;
          return value;
        } else if (pgType === 'boolean') {
          // Pour les colonnes booléennes
          if (value === 1) return true;
          if (value === 0) return false;
          return value;
        } else {
          // Pour les autres types
          return value;
        }
      });
      
      // Créer les placeholders pour les paramètres ($1, $2, etc.)
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      
      // Créer la requête d'insertion
      const query = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO NOTHING
      `;
      
      // Exécuter la requête
      await client.query(query, convertedValues);
    }

    // Réactiver les déclencheurs
    await client.query(`ALTER TABLE ${tableName} ENABLE TRIGGER ALL`);

    // Si la table a une séquence d'ID auto-incrémenté, mettre à jour la séquence
    try {
      await client.query(`
        SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), coalesce(max(id), 0) + 1, false)
        FROM ${tableName}
      `);
    } catch (seqError) {
      // Ignorer l'erreur si la séquence n'existe pas
      console.log(`Note: Impossible de mettre à jour la séquence pour ${tableName}. Cela peut être normal.`);
    }

    // Valider la transaction
    await client.query('COMMIT');

    console.log(`${rows.length} enregistrements insérés dans la table ${tableName}.`);
  } catch (error) {
    // Annuler la transaction en cas d'erreur
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Libérer le client
    client.release();
  }
}

// Exécuter la migration
migrateData();