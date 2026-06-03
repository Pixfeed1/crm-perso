// backend/config/pgConfig.js
const { Pool } = require('pg');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

dotenv.config();

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
   * Teste la connexion a PostgreSQL
   */
  async testConnection() {
    try {
      await this.pool.query('SELECT 1');
      this.initDatabase();
    } catch (err) {
      console.error('[DBConfig] Erreur connexion PostgreSQL:', err.message);
    }
  }

  /**
   * Initialise la base de donnees (utilisateur par defaut)
   */
  async initDatabase() {
    try {
      await this.initDefaultUser();
    } catch (error) {
      console.error('[DBConfig] Erreur initialisation:', error.message);
    }
  }

  /**
   * Initialise l'utilisateur par defaut si necessaire
   */
  async initDefaultUser() {
    const username = process.env.DEFAULT_USER_USERNAME;
    const password = process.env.DEFAULT_USER_PASSWORD;

    if (!username || !password) {
      return;
    }

    const userCheck = await this.pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (userCheck.rowCount > 0) {
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    await this.pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      [username, hash]
    );
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

  // Méthode query directe pour compatibilité avec db.query()
  async query(text, params) {
    return this.pool.query(text, params);
  }

  // Convertir les paramètres SQLite (tableau) en paramètres PostgreSQL (tableau)
  convertParams(params) {
    if (!params) return [];
    if (!Array.isArray(params)) return [params];
    return params;
  }

  // Convertir les requêtes SQLite en PostgreSQL
  //
  // LIMITE CONNUE : ce shim convertit tout littéral "= 0" / "= 1" isolé en booléen
  // (= false / = true). Il ne faut donc PAS comparer une colonne ENTIÈRE (numérique)
  // à un littéral 0 ou 1 directement dans une requête passée par ce shim, sous peine
  // de la voir transformée en comparaison booléenne. Pour ce cas, utiliser
  // db.pool.query avec un paramètre lié ($1) au lieu de la valeur en dur.
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
    // \bLIKE\b : seul le mot-clé LIKE isolé est converti (n'altère plus ILIKE -> IILIKE
    // ni une sous-chaîne contenant "like")
    pgQuery = pgQuery.replace(/\bLIKE\b/g, 'ILIKE');

    // Gérer les INSERTS et UPDATES avec RETURNING
    // On vérifie que la requête COMMENCE par insert into / update (regex ancrées),
    // pour ne pas ajouter RETURNING id à un SELECT contenant le mot "update" dans une chaîne.
    if (/^\s*insert\s+into/i.test(pgQuery) && !pgQuery.toLowerCase().includes('returning')) {
      pgQuery += ' RETURNING id';
    }

    if (/^\s*update\s+/i.test(pgQuery) && !pgQuery.toLowerCase().includes('returning')) {
      pgQuery += ' RETURNING id';
    }

    // Adapter les expressions booléennes (0/1 à false/true)
    // (?![\d.]) : ne convertit que les 0/1 isolés (ne corrompt plus = 100, = 10, = 0.5)
    pgQuery = pgQuery.replace(/= 0(?![\d.])/g, '= false');
    pgQuery = pgQuery.replace(/= 1(?![\d.])/g, '= true');
    
    return pgQuery;
  }
}

// Créer l'instance de configuration de base de données
const dbConfig = new DatabaseConfig();

// Exporter à la fois l'instance complète pour accéder aux méthodes
// et le pool pour les utilisations directes
module.exports = dbConfig;