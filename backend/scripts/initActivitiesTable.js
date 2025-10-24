// backend/scripts/initActivitiesTable.js

/**
 * Script pour initialiser les tables activities et projects
 */

// Charger les dépendances
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Chemin vers la base de données
const dbPath = path.join(__dirname, '..', 'database.db');

// Sauvegarde de la base de données
const backupPath = path.join(__dirname, '..', `database_backup_${Date.now()}.db`);

// Effectuer une sauvegarde
fs.copyFileSync(dbPath, backupPath);
console.log(`Sauvegarde de la base de données créée: ${backupPath}`);

// Connexion à la base de données
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erreur lors de la connexion à la base de données:', err.message);
    process.exit(1);
  }
  console.log('Connexion à la base de données établie.');
  
  // Commencer l'initialisation
  initTables();
});

function initTables() {
  // Désactiver les clés étrangères pendant l'initialisation
  db.run('PRAGMA foreign_keys = OFF', (err) => {
    if (err) {
      console.error('Erreur lors de la désactivation des clés étrangères:', err.message);
      cleanup(1);
      return;
    }
    
    // Commencer une transaction
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('Erreur lors du démarrage de la transaction:', err.message);
        cleanup(1);
        return;
      }
      
      console.log('Création de la table projects...');
      
      // Créer la table projects
      db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'active',
          start_date TEXT,
          end_date TEXT,
          client_id INTEGER,
          created_at TEXT,
          updated_at TEXT
        )
      `, (err) => {
        if (err) {
          console.error('Erreur lors de la création de la table projects:', err.message);
          rollback();
          return;
        }
        
        console.log('Table projects créée avec succès.');
        console.log('Création de la table activities...');
        
        // Créer la table activities
        db.run(`
          CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            planned_time INTEGER DEFAULT 0,
            actual_time INTEGER DEFAULT 0,
            date TEXT NOT NULL,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'planned',
            project_id INTEGER,
            lead_id INTEGER,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('Erreur lors de la création de la table activities:', err.message);
            rollback();
            return;
          }
          
          console.log('Table activities créée avec succès.');
          
          // Valider la transaction
          db.run('COMMIT', (err) => {
            if (err) {
              console.error('Erreur lors de la validation de la transaction:', err.message);
              rollback();
              return;
            }
            
            console.log('Initialisation des tables terminée avec succès!');
            
            // Réactiver les clés étrangères
            db.run('PRAGMA foreign_keys = ON', (err) => {
              if (err) {
                console.error('Erreur lors de la réactivation des clés étrangères:', err.message);
              }
              
              cleanup(0);
            });
          });
        });
      });
    });
  });
}

function rollback() {
  db.run('ROLLBACK', (err) => {
    if (err) {
      console.error('Erreur lors de l\'annulation de la transaction:', err.message);
    }
    
    console.log('Initialisation annulée. Aucune modification n\'a été apportée à la base de données.');
    console.log(`Vous pouvez utiliser la sauvegarde si nécessaire: ${backupPath}`);
    
    cleanup(1);
  });
}

function cleanup(exitCode) {
  // Fermer la connexion à la base de données
  db.close((err) => {
    if (err) {
      console.error('Erreur lors de la fermeture de la connexion:', err.message);
      process.exit(1);
    }
    
    console.log('Connexion à la base de données fermée.');
    process.exit(exitCode);
  });
}