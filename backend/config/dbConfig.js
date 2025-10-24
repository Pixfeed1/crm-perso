// backend/config/dbConfig.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const runMigrations = require('./dbMigrations');
const CONSTANTS = require('../constants');

/**
 * Configuration et initialisation de la base de données
 */
class DatabaseConfig {
  constructor() {
    // Chemin vers le fichier de base de données
    this.dbPath = path.resolve(__dirname, '../database.db');
    console.log('[DBConfig] Chemin de la base de données:', this.dbPath);
    
    // Instance de base de données
    this.db = null;
    
    // Initialisations
    this.initDatabase();
  }

  /**
   * Initialise la connexion à la base de données et exécute les migrations
   */
  async initDatabase() {
    console.log('[DBConfig] Démarrage de l\'initialisation de la base de données...');
    
    try {
      // Créer la connexion à la base de données
      await this.createConnection();
      
      // Activer les fonctionnalités SQLite importantes
      await this.enableForeignKeys();
      
      // Exécuter les migrations
      await runMigrations(this.db);
      
      // Initialiser l'utilisateur par défaut
      await this.initDefaultUser();
      
      console.log('[DBConfig] Initialisation de la base de données terminée avec succès');
    } catch (error) {
      console.error('[DBConfig] Erreur lors de l\'initialisation de la base de données:', error);
      throw error;
    }
  }

  /**
   * Crée la connexion à la base de données SQLite
   * @returns {Promise} Promesse résolue une fois la connexion établie
   */
  createConnection() {
    return new Promise((resolve, reject) => {
      console.log('[DBConfig] Création de la connexion à la base de données...');
      
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('[DBConfig] Erreur de connexion à la base de données:', err.message);
          return reject(err);
        }
        
        console.log('[DBConfig] Connexion à la base de données SQLite établie');
        resolve();
      });
    });
  }

  /**
   * Active les clés étrangères dans SQLite
   * @returns {Promise} Promesse résolue une fois les clés étrangères activées
   */
  enableForeignKeys() {
    return new Promise((resolve, reject) => {
      console.log('[DBConfig] Activation des clés étrangères...');
      
      this.db.run('PRAGMA foreign_keys = ON;', (err) => {
        if (err) {
          console.error('[DBConfig] Erreur lors de l\'activation des clés étrangères:', err.message);
          return reject(err);
        }
        
        console.log('[DBConfig] Clés étrangères activées');
        resolve();
      });
    });
  }

  /**
   * Initialise l'utilisateur par défaut si nécessaire
   * @returns {Promise} Promesse résolue une fois l'utilisateur vérifié/créé
   */
  initDefaultUser() {
    return new Promise((resolve, reject) => {
      console.log('[DBConfig] Vérification de l\'utilisateur par défaut...');
      
      const username = 'mvaertan';
      const password = 'Vashthestampede2a';
      
      // Vérifier si l'utilisateur existe déjà
      this.db.get('SELECT id, username, password FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
          console.error('[DBConfig] Erreur lors de la vérification de l\'utilisateur:', err.message);
          return reject(err);
        }
        
        if (user) {
          console.log('[DBConfig] Utilisateur par défaut déjà existant:', user.id, user.username);
          return resolve();
        }
        
        console.log('[DBConfig] Création de l\'utilisateur par défaut...');
        
        // Hacher le mot de passe
        bcrypt.hash(password, 10, (err, hash) => {
          if (err) {
            console.error('[DBConfig] Erreur lors du hachage du mot de passe:', err.message);
            return reject(err);
          }
          
          // Insérer l'utilisateur dans la base de données
          this.db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function(err) {
            if (err) {
              console.error('[DBConfig] Erreur lors de la création de l\'utilisateur:', err.message);
              return reject(err);
            }
            
            console.log('[DBConfig] Utilisateur par défaut créé avec succès, ID:', this.lastID);
            resolve();
          });
        });
      });
    });
  }
}

// Créer et initialiser la configuration de la base de données
const dbConfig = new DatabaseConfig();

// Exporter l'instance de base de données pour utilisation dans l'application
module.exports = dbConfig.db;