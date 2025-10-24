// backend/config/pgConfig.js
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcrypt');
const runMigrations = require('./pgMigrations');

// Charger les variables d'environnement
dotenv.config();

console.log('[DBConfig] Initialisation de la connexion PostgreSQL');
console.log('[DBConfig] DB_USER:', process.env.DB_USER);
console.log('[DBConfig] DB_HOST:', process.env.DB_HOST);
console.log('[DBConfig] DB_NAME:', process.env.DB_NAME);
console.log('[DBConfig] DB_PORT:', process.env.DB_PORT);
// Ne pas afficher le mot de passe en production pour des raisons de sécurité

/**
 * Configuration et initialisation de la base de données PostgreSQL
 */
class DatabaseConfig {
  constructor() {
    // Créer un pool de connexions PostgreSQL
    this.pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'mcrm_dev',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
    });
    
    // Tester la connexion
    this.testConnection();
  }

  /**
   * Teste la connexion à PostgreSQL
   */
  async testConnection() {
    try {
      const res = await this.pool.query('SELECT NOW()');
      console.log('[DBConfig] Connexion à PostgreSQL établie:', res.rows[0]);
      
      // Initialiser la base de données après une connexion réussie
      this.initDatabase();
    } catch (err) {
      console.error('[DBConfig] Erreur de connexion à PostgreSQL:', err);
    }
  }

  /**
   * Initialise la connexion à la base de données et exécute les migrations
   */
  async initDatabase() {
    console.log('[DBConfig] Démarrage de l\'initialisation de la base de données...');
    
    try {
      // Exécuter les migrations
      await runMigrations(this.pool);
      
      // Initialiser l'utilisateur par défaut
      await this.initDefaultUser();
      
      console.log('[DBConfig] Initialisation de la base de données terminée avec succès');
    } catch (error) {
      console.error('[DBConfig] Erreur lors de l\'initialisation de la base de données:', error);
    }
  }

  /**
   * Initialise l'utilisateur par défaut si nécessaire
   * @returns {Promise} Promesse résolue une fois l'utilisateur vérifié/créé
   */
  async initDefaultUser() {
    console.log('[DBConfig] Vérification de l\'utilisateur par défaut...');

    // Utiliser les variables d'environnement pour l'utilisateur par défaut
    const username = process.env.DEFAULT_USER_USERNAME;
    const password = process.env.DEFAULT_USER_PASSWORD;

    // Ne créer l'utilisateur que si les variables d'environnement sont définies
    if (!username || !password) {
      console.log('[DBConfig] Aucun utilisateur par défaut configuré (DEFAULT_USER_USERNAME et DEFAULT_USER_PASSWORD non définis)');
      return;
    }

    try {
      // Vérifier si l'utilisateur existe déjà
      const userCheck = await this.pool.query(
        'SELECT id, username FROM users WHERE username = $1',
        [username]
      );

      if (userCheck.rowCount > 0) {
        console.log('[DBConfig] Utilisateur par défaut déjà existant:',
          userCheck.rows[0].id, userCheck.rows[0].username);
        return;
      }

      console.log('[DBConfig] Création de l\'utilisateur par défaut...');

      // Hacher le mot de passe
      const hash = await bcrypt.hash(password, 10);

      // Insérer l'utilisateur dans la base de données
      const insertResult = await this.pool.query(
        'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
        [username, hash]
      );

      console.log('[DBConfig] Utilisateur par défaut créé avec succès, ID:',
        insertResult.rows[0].id);
    } catch (error) {
      console.error('[DBConfig] Erreur lors de la création de l\'utilisateur:', error.message);
      throw error;
    }
  }

  // Méthodes pour maintenir la compatibilité avec les contrôleurs existants
  get(query, params, callback) {
    // Vérifier si callback est une fonction
    if (typeof callback !== 'function') {
      console.error('[DBConfig] Erreur: callback non défini dans get()');
      return;
    }
    
    // Convertir la requête SQLite en PostgreSQL
    const pgQuery = this.convertQuery(query);
    const pgParams = this.convertParams(params);
    
    this.pool.query(pgQuery, pgParams, (err, res) => {
      if (err) {
        return callback(err);
      }
      callback(null, res.rows[0]);
    });
  }

  all(query, params, callback) {
    // Vérifier si callback est une fonction
    if (typeof callback !== 'function') {
      console.error('[DBConfig] Erreur: callback non défini dans all()');
      return;
    }
    
    // Convertir la requête SQLite en PostgreSQL
    const pgQuery = this.convertQuery(query);
    const pgParams = this.convertParams(params);
    
    this.pool.query(pgQuery, pgParams, (err, res) => {
      if (err) {
        return callback(err);
      }
      callback(null, res.rows);
    });
  }

  run(query, params, callback) {
    // Convertir la requête SQLite en PostgreSQL
    const pgQuery = this.convertQuery(query);
    const pgParams = this.convertParams(params);
    
    this.pool.query(pgQuery, pgParams, (err, res) => {
      if (err) {
        if (typeof callback === 'function') {
          return callback(err);
        }
        console.error('[DBConfig] Erreur dans run():', err);
        return;
      }
      
      // Simuler l'objet this avec lastID et changes pour la compatibilité
      const context = {
        lastID: res.rows[0]?.id || null,
        changes: res.rowCount || 0
      };
      
      if (typeof callback === 'function') {
        callback.call(context, null);
      }
    });
  }

  // Fermer la connexion à la base de données
  close(callback) {
    this.pool.end((err) => {
      if (typeof callback === 'function') {
        callback(err);
      }
    });
  }

  // Convertir les paramètres SQLite (tableau) en paramètres PostgreSQL (tableau)
  convertParams(params) {
    if (!params) return [];
    if (!Array.isArray(params)) return [params];
    return params;
  }

  // Convertir les requêtes SQLite en PostgreSQL
  convertQuery(query) {
    let pgQuery = query;
    
    // Remplacer les placeholders SQLite (?) par les placeholders PostgreSQL ($1, $2, etc.)
    let paramIndex = 0;
    pgQuery = pgQuery.replace(/\?/g, () => `$${++paramIndex}`);
    
    // Remplacer PRAGMA foreign_keys = ON par SET constraints
    pgQuery = pgQuery.replace(/PRAGMA foreign_keys = ON;/g, 'SET CONSTRAINTS ALL IMMEDIATE;');
    
    // Remplacer les fonctions de date SQLite
    pgQuery = pgQuery.replace(/strftime\('%Y-%m', date\)/g, "to_char(date, 'YYYY-MM')");
    
    // Remplacer AUTOINCREMENT par SERIAL dans les CREATE TABLE
    pgQuery = pgQuery.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
    
    // Remplacer les comportements SQLite de LIKE (case sensitive/insensitive)
    pgQuery = pgQuery.replace(/LIKE/g, 'ILIKE');
    
    // Gérer les INSERTS avec RETURNING
    if (pgQuery.toLowerCase().includes('insert into') && !pgQuery.toLowerCase().includes('returning')) {
      pgQuery += ' RETURNING id';
    }
    
    // Adapter les expressions booléennes (0/1 à false/true)
    pgQuery = pgQuery.replace(/= 0/g, '= false');
    pgQuery = pgQuery.replace(/= 1/g, '= true');
    
    return pgQuery;
  }
}

// Créer l'instance de configuration de base de données
const dbConfig = new DatabaseConfig();

// Exporter à la fois l'instance complète pour accéder aux méthodes
// et le pool pour les utilisations directes
module.exports = dbConfig;