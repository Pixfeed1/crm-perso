// src/database/dbConfig.js
import initSqlJs from 'sql.js';
import { openDB } from 'idb';

// Singleton pour la connexion à la base de données
let dbInstance = null;

// Base de données IndexedDB pour la persistance
const IDB_NAME = 'crm_audacieux_db';
const IDB_VERSION = 1;
const SQLITE_STORE = 'sqlitedb';

// Variable pour suivre l'état de l'initialisation
let isInitializing = false;
let initPromise = null;

// Constantes de timeout
const SQL_TIMEOUT = 60000; // 60 secondes pour SQL.js
const IDB_TIMEOUT = 30000; // 30 secondes pour IndexedDB

// Initialisation de la base de données
export const initDB = async () => {
  // Ne pas initialiser la base de données si une réinitialisation est en cours
  if (window.isAppResetting || window.stopAllDbOperations) {
    console.log('Initialisation de la base de données annulée car une réinitialisation est en cours');
    return Promise.reject(new Error('DB_RESET_IN_PROGRESS'));
  }

  // Si l'initialisation est déjà en cours, retourner la promesse existante
  if (isInitializing) {
    console.log('Initialisation déjà en cours, retourne la promesse existante');
    return initPromise;
  }
  
  // Si la base de données est déjà initialisée, la retourner
  if (dbInstance && !window.isAppResetting) {
    console.log('Instance de base de données déjà initialisée, retourne instance existante');
    return dbInstance;
  }

  isInitializing = true;
  console.log('Démarrage du processus d\'initialisation...');
  initPromise = _initializeDB();
  
  try {
    dbInstance = await initPromise;
    console.log('Initialisation complète réussie');
    return dbInstance;
  } catch (error) {
    console.error('Erreur lors de l\'initialisation:', error);
    throw error;
  } finally {
    isInitializing = false;
    initPromise = null;
  }
};

// Fonction interne d'initialisation
const _initializeDB = async () => {
  try {
    console.log('Démarrage de l\'initialisation de la base de données');
    
    // Vérifier à nouveau si une réinitialisation est en cours
    if (window.isAppResetting || window.stopAllDbOperations) {
      return Promise.reject(new Error('DB_RESET_IN_PROGRESS'));
    }
    
    // Fermer l'instance existante si elle existe
    if (dbInstance) {
      try {
        dbInstance.close();
        dbInstance = null;
        console.log('Instance existante de la base de données fermée');
      } catch (error) {
        console.warn('Erreur lors de la fermeture de la base de données:', error);
      }
    }
    
    // Initialiser SQL.js avec gestion des erreurs et timeout
    console.log('Initialisation de SQL.js');
    let SQL;
    try {
      const sqlPromise = initSqlJs({
        // Utiliser un CDN fiable pour charger le fichier wasm
        locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/${file}`
      });
      
      // Ajouter un timeout
      SQL = await withTimeout(sqlPromise, SQL_TIMEOUT, 'Chargement de SQL.js');
      console.log('SQL.js chargé avec succès');
    } catch (error) {
      console.error('Erreur lors du chargement de SQL.js:', error);
      throw error;
    }

    // Ouvrir IndexedDB pour la persistance avec gestion des erreurs et timeout
    console.log('Ouverture de IndexedDB');
    let idb;
    try {
      const idbPromise = openDB(IDB_NAME, IDB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(SQLITE_STORE)) {
            db.createObjectStore(SQLITE_STORE);
          }
        },
        blocked() {
          console.warn('Ouverture de IndexedDB bloquée par une autre connexion');
        },
        blocking() {
          console.warn('Cette connexion bloque une mise à niveau de la base de données');
        },
        terminated() {
          console.error('Connexion à IndexedDB terminée de manière inattendue');
        }
      });
      
      // Ajouter un timeout
      idb = await withTimeout(idbPromise, IDB_TIMEOUT, 'Ouverture de IndexedDB');
      console.log('IndexedDB ouvert avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'ouverture de IndexedDB:', error);
      // Vérifier si c'est une erreur de permissions
      if (error.name === 'SecurityError' || error.name === 'PermissionDeniedError') {
        throw new Error('Accès à IndexedDB refusé. Vérifiez les permissions du navigateur.');
      }
      // Pour les autres erreurs
      throw error;
    }

    // Récupérer la base de données SQLite depuis IndexedDB si elle existe
    console.log('Vérification de la base de données existante dans IndexedDB');
    let sqliteBuffer = null;
    try {
      sqliteBuffer = await idb.get(SQLITE_STORE, 'db');
      if (sqliteBuffer) {
        console.log('Base de données existante trouvée dans IndexedDB');
      } else {
        console.log('Aucune base de données existante trouvée dans IndexedDB');
      }
    } catch (error) {
      console.warn('Erreur lors de la récupération de la base de données:', error);
      sqliteBuffer = null;
    }
    
    // Créer une nouvelle base de données ou charger l'existante
    console.log('Création de l\'instance de base de données SQL');
    let newDbInstance;
    try {
      newDbInstance = new SQL.Database(sqliteBuffer);
      console.log('Instance SQL.js créée avec succès');
    } catch (error) {
      console.error('Erreur lors de la création de l\'instance SQL:', error);
      // Si erreur lors du chargement du buffer existant, créer une nouvelle base propre
      console.log('Tentative de création d\'une nouvelle base de données propre');
      newDbInstance = new SQL.Database();
      sqliteBuffer = null; // Pour forcer la création du schéma
    }
    
    // Rendre l'instance accessible globalement
    window.sqliteConnection = newDbInstance;
    
    // Si c'est une nouvelle base, initialiser le schéma
    if (!sqliteBuffer) {
      console.log('Création d\'une nouvelle base de données');
      try {
        await createSchema(newDbInstance);
        
        // Sauvegarder immédiatement la nouvelle base
        const data = newDbInstance.export();
        const buffer = new Uint8Array(data);
        await idb.put(SQLITE_STORE, buffer, 'db');
        console.log('Nouvelle base de données sauvegardée dans IndexedDB');
      } catch (error) {
        console.error('Erreur lors de la création du schéma:', error);
        throw error;
      }
    } else {
      console.log('Base de données chargée depuis IndexedDB');
      
      // Vérifier l'intégrité de la base de données
      try {
        // Exécuter une requête simple pour vérifier que la base de données est valide
        const result = newDbInstance.exec("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('Vérification d\'intégrité réussie, tables trouvées:', result);
      } catch (error) {
        console.error('Base de données corrompue ou invalide, création d\'une nouvelle:', error);
        
        try {
          // Fermer la base de données invalide
          newDbInstance.close();
          
          // Créer une nouvelle base de données propre
          newDbInstance = new SQL.Database();
          window.sqliteConnection = newDbInstance;
          
          // Créer un nouveau schéma
          await createSchema(newDbInstance);
          
          // Sauvegarder immédiatement la nouvelle base
          const data = newDbInstance.export();
          const buffer = new Uint8Array(data);
          await idb.put(SQLITE_STORE, buffer, 'db');
          console.log('Nouvelle base de données recréée avec succès et sauvegardée');
        } catch (innerError) {
          console.error('Erreur lors de la recréation de la base de données:', innerError);
          throw innerError;
        }
      }
    }

    // Configurer la sauvegarde automatique
    try {
      setupAutoSave(newDbInstance, idb);
      console.log('Sauvegarde automatique configurée');
    } catch (error) {
      console.error('Erreur lors de la configuration de la sauvegarde automatique:', error);
      // On continue malgré l'erreur
    }
    
    return newDbInstance;
  } catch (error) {
    console.error('Erreur fatale lors de l\'initialisation de la base de données:', error);
    throw error;
  }
};

// Fonction d'aide pour ajouter un timeout aux promesses
function withTimeout(promise, ms, operationName) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout lors de: ${operationName} (${ms}ms dépassées)`)), ms)
    )
  ]);
}

// Création du schéma de la base de données
const createSchema = async (db) => {
  console.log('Création du schéma de la base de données');
  
  try {
    // Leads
    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        type TEXT CHECK(type IN ('company', 'individual')),
        status TEXT NOT NULL,
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Contacts
    db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        name TEXT NOT NULL,
        position TEXT,
        email TEXT,
        phone TEXT,
        is_primary BOOLEAN DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      )
    `);

    // Projects
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        start_date DATE,
        end_date DATE,
        status TEXT NOT NULL,
        amount REAL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      )
    `);

    // Activities
    db.run(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        planned_time INTEGER,
        actual_time INTEGER,
        date DATE NOT NULL,
        priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        status TEXT CHECK(status IN ('planned', 'in_progress', 'completed', 'cancelled')),
        project_id INTEGER,
        lead_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      )
    `);

    // Calendar Events
    db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        start_datetime TIMESTAMP NOT NULL,
        end_datetime TIMESTAMP,
        all_day BOOLEAN DEFAULT 0,
        location TEXT,
        category TEXT,
        priority TEXT,
        color TEXT,
        reminder_time TIMESTAMP,
        activity_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL
      )
    `);

    // Revenues
    db.run(`
      CREATE TABLE IF NOT EXISTS revenues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL,
        date DATE NOT NULL,
        description TEXT,
        project_id INTEGER,
        type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `);

    // Goals
    db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        target_value REAL,
        current_value REAL DEFAULT 0,
        category TEXT NOT NULL,
        period TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Milestones (ajouté pour éviter l'erreur "no such table: milestones")
    db.run(`
      CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target REAL NOT NULL,
        achieved BOOLEAN DEFAULT 0,
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
      )
    `);

    console.log('Schéma de base de données créé avec succès');
  } catch (error) {
    console.error('Erreur lors de la création du schéma:', error);
    throw error;
  }
};

// Configuration de la sauvegarde automatique
const setupAutoSave = (db, idb) => {
  // Nettoyer les ressources existantes avant d'en créer de nouvelles
  if (window.dbSaveInterval) {
    clearInterval(window.dbSaveInterval);
    window.dbSaveInterval = null;
  }
  
  if (window.dbBeforeUnloadHandler) {
    window.removeEventListener('beforeunload', window.dbBeforeUnloadHandler);
    window.dbBeforeUnloadHandler = null;
  }
  
  let isAutoSaving = false;
  
  // Fonction de sauvegarde
  const saveDatabase = async () => {
    // Ne pas sauvegarder si une opération de sauvegarde est déjà en cours
    // ou si une réinitialisation est en cours
    if (isAutoSaving || window.isAppResetting || window.stopAllDbOperations) {
      return;
    }
    
    isAutoSaving = true;
    
    try {
      const data = db.export();
      const buffer = new Uint8Array(data);
      await idb.put(SQLITE_STORE, buffer, 'db');
      console.log('Base de données sauvegardée dans IndexedDB');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la base de données:', error);
    } finally {
      isAutoSaving = false;
    }
  };
  
  // Sauvegarder toutes les 30 secondes
  const saveInterval = setInterval(saveDatabase, 30000);
  window.dbSaveInterval = saveInterval;

  // Sauvegarder avant de quitter la page
  const beforeUnloadHandler = async () => {
    if (window.isAppResetting || window.stopAllDbOperations) {
      return;
    }
    
    try {
      await saveDatabase();
      console.log('Base de données sauvegardée avant fermeture');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde avant fermeture:', error);
    }
  };
  
  // Ajouter le gestionnaire d'événement
  window.addEventListener('beforeunload', beforeUnloadHandler);
  window.dbBeforeUnloadHandler = beforeUnloadHandler;
};

// Obtenir une instance de la base de données
export const getDB = async () => {
  // Vérifier si une réinitialisation est en cours
  if (window.isAppResetting || window.stopAllDbOperations) {
    console.warn('Tentative d\'accès à la base de données pendant une réinitialisation');
    return Promise.reject(new Error('DB_RESET_IN_PROGRESS'));
  }
  
  if (!dbInstance) {
    return await initDB();
  }
  return dbInstance;
};

// Exécuter une requête SQL
export const executeQuery = async (query, params = []) => {
  if (window.isAppResetting || window.stopAllDbOperations) {
    console.warn('Tentative d\'exécution de requête pendant une réinitialisation');
    return Promise.reject(new Error('DB_RESET_IN_PROGRESS'));
  }
  
  try {
    const db = await getDB();
    return db.exec(query, params);
  } catch (error) {
    if (error.message === 'DB_RESET_IN_PROGRESS') {
      throw error;
    }
    console.error('Erreur lors de l\'exécution de la requête:', error);
    console.error('Requête:', query);
    console.error('Paramètres:', params);
    throw error;
  }
};
