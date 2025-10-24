// backend/scripts/createTables.js
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
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

// Liste des tables à créer
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
async function createTables() {
  try {
    console.log('Démarrage de la création des tables dans PostgreSQL...');
    
    // Parcourir toutes les tables
    for (const table of tables) {
      console.log(`Récupération du schéma pour la table ${table}...`);
      
      // Vérifier si la table existe dans SQLite
      const tableExists = await checkTableExists(table);
      
      if (!tableExists) {
        console.log(`La table ${table} n'existe pas dans la base de données SQLite, ignorée.`);
        continue;
      }
      
      // Obtenir le schéma de la table SQLite
      const schema = await getTableSchema(table);
      
      if (!schema) {
        console.log(`Impossible de récupérer le schéma pour la table ${table}.`);
        continue;
      }
      
      // Créer la table dans PostgreSQL
      await createTableInPostgres(table, schema);
      
      console.log(`Création de la table ${table} terminée.`);
    }
    
    console.log('Création des tables terminée avec succès!');
  } catch (error) {
    console.error('Erreur lors de la création des tables:', error);
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

// Obtenir le schéma d'une table SQLite
function getTableSchema(tableName) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (columns.length === 0) {
        resolve(null);
        return;
      }
      
      resolve(columns);
    });
  });
}

// Mapper les types SQLite vers les types PostgreSQL
function mapType(sqliteType) {
  const type = sqliteType.toUpperCase();
  
  if (type.includes('INT')) return 'INTEGER';
  if (type.includes('CHAR') || type.includes('TEXT') || type.includes('CLOB')) return 'TEXT';
  if (type.includes('BLOB')) return 'BYTEA';
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'FLOAT';
  if (type.includes('BOOL')) return 'BOOLEAN';
  if (type.includes('DATE') || type.includes('TIME')) return 'TIMESTAMP';
  
  return 'TEXT'; // Type par défaut
}

// Créer une table dans PostgreSQL
async function createTableInPostgres(tableName, schema) {
  const client = await pgPool.connect();
  
  try {
    // Vérifier si la table existe déjà
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `;
    
    const tableExistsResult = await client.query(tableExistsQuery, [tableName]);
    
    if (tableExistsResult.rows[0].exists) {
      console.log(`La table ${tableName} existe déjà dans PostgreSQL, ignorée.`);
      return;
    }
    
    // Construire la requête de création de table
    let createTableQuery = `CREATE TABLE ${tableName} (\n`;
    
    // Ajouter les colonnes
    const columnDefinitions = schema.map(column => {
      const columnName = column.name;
      const columnType = mapType(column.type);
      const notNull = column.notnull ? 'NOT NULL' : '';
      const primaryKey = column.pk ? 'PRIMARY KEY' : '';
      
      return `  "${columnName}" ${columnType} ${notNull} ${primaryKey}`.trim();
    });
    
    createTableQuery += columnDefinitions.join(',\n');
    createTableQuery += '\n);';
    
    // Exécuter la requête
    await client.query(createTableQuery);
    
    console.log(`Table ${tableName} créée avec succès.`);
  } catch (error) {
    console.error(`Erreur lors de la création de la table ${tableName}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

// Exécuter la création des tables
createTables();