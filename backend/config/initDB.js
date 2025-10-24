// backend/config/initDB.js
const db = require('./dbConfig');

/**
 * Initialise la structure de la base de données
 */
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    console.log('[InitDB] Vérification et création des tables...');
    
    // Vérifier si la table activities existe
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'", (err, table) => {
      if (err) {
        console.error('[InitDB] Erreur lors de la vérification des tables:', err);
        return reject(err);
      }
      
      // Liste des promesses pour la création de tables
      const tablePromises = [];
      
      // Création de la table activities si elle n'existe pas
      if (!table) {
        console.log('[InitDB] Table activities non trouvée, création en cours...');
        tablePromises.push(createActivitiesTable());
      } else {
        console.log('[InitDB] Table activities existe déjà');
      }
      
      // Vérification d'autres tables nécessaires
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'", (err, projectTable) => {
        if (err) {
          console.error('[InitDB] Erreur lors de la vérification de la table projects:', err);
          return reject(err);
        }
        
        if (!projectTable) {
          console.log('[InitDB] Table projects non trouvée, création en cours...');
          tablePromises.push(createProjectsTable());
        } else {
          console.log('[InitDB] Table projects existe déjà');
        }
        
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'", (err, leadTable) => {
          if (err) {
            console.error('[InitDB] Erreur lors de la vérification de la table leads:', err);
            return reject(err);
          }
          
          if (!leadTable) {
            console.log('[InitDB] Table leads non trouvée, création en cours...');
            tablePromises.push(createLeadsTable());
          } else {
            console.log('[InitDB] Table leads existe déjà');
          }
          
          // Exécuter toutes les promesses de création de tables
          Promise.all(tablePromises)
            .then(() => {
              console.log('[InitDB] Toutes les tables ont été vérifiées et créées avec succès');
              resolve();
            })
            .catch((error) => {
              console.error('[InitDB] Erreur lors de la création des tables:', error);
              reject(error);
            });
        });
      });
    });
  });
};

/**
 * Crée la table activities
 */
const createActivitiesTable = () => {
  return new Promise((resolve, reject) => {
    const query = `
      CREATE TABLE activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        planned_time REAL DEFAULT 0,
        actual_time REAL DEFAULT 0,
        date TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'planned',
        project_id INTEGER,
        lead_id INTEGER,
        created_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects (id),
        FOREIGN KEY (lead_id) REFERENCES leads (id)
      )
    `;
    
    db.run(query, (err) => {
      if (err) {
        console.error('[InitDB] Erreur lors de la création de la table activities:', err);
        reject(err);
      } else {
        console.log('[InitDB] Table activities créée avec succès');
        resolve();
      }
    });
  });
};

/**
 * Crée la table projects
 */
const createProjectsTable = () => {
  return new Promise((resolve, reject) => {
    const query = `
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT,
        end_date TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT
      )
    `;
    
    db.run(query, (err) => {
      if (err) {
        console.error('[InitDB] Erreur lors de la création de la table projects:', err);
        reject(err);
      } else {
        console.log('[InitDB] Table projects créée avec succès');
        resolve();
      }
    });
  });
};

/**
 * Crée la table leads
 */
const createLeadsTable = () => {
  return new Promise((resolve, reject) => {
    const query = `
      CREATE TABLE leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        status TEXT DEFAULT 'new',
        created_at TEXT
      )
    `;
    
    db.run(query, (err) => {
      if (err) {
        console.error('[InitDB] Erreur lors de la création de la table leads:', err);
        reject(err);
      } else {
        console.log('[InitDB] Table leads créée avec succès');
        resolve();
      }
    });
  });
};

module.exports = initDatabase;