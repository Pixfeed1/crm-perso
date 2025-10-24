// backend/scripts/createProjectsTable.js

/**
 * Script de migration pour créer la table projects
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
  
  // Commencer la migration
  createProjectsTable();
});

function createProjectsTable() {
  // Activer le mode foreign_keys pour s'assurer que les contraintes sont respectées
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
      
      // 1. Vérifier si la table projects existe déjà
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'", (err, table) => {
        if (err) {
          console.error('Erreur lors de la vérification de la table projects:', err.message);
          rollback();
          return;
        }
        
        if (table) {
          console.log('La table projects existe déjà. Aucune action nécessaire.');
          // Valider la transaction et terminer
          db.run("COMMIT", (err) => {
            if (err) {
              console.error('Erreur lors de la validation de la transaction:', err.message);
              rollback();
              return;
            }
            
            console.log("La table projects existe déjà, aucune modification effectuée.");
            cleanup(0);
          });
          return;
        }
        
        console.log('La table projects n\'existe pas. Création en cours...');
        
        // 2. Créer la table projects
        db.run(`
          CREATE TABLE projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            start_date TEXT,
            end_date TEXT,
            status TEXT NOT NULL,
            amount REAL,
            lead_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('Erreur lors de la création de la table projects:', err.message);
            rollback();
            return;
          }
          
          console.log('Table projects créée avec succès.');
          
          // 3. Vérifier si la table leads existe, créer si nécessaire
          db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'", (err, leadsTable) => {
            if (err) {
              console.error('Erreur lors de la vérification de la table leads:', err.message);
              // Continuer malgré l'erreur
            }
            
            const createLeadsIfNeeded = (callback) => {
              if (!leadsTable) {
                console.log('La table leads n\'existe pas. Création en cours...');
                db.run(`
                  CREATE TABLE leads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT,
                    phone TEXT,
                    company TEXT,
                    status TEXT DEFAULT 'new',
                    created_at TEXT NOT NULL,
                    updated_at TEXT
                  )
                `, (err) => {
                  if (err) {
                    console.error('Erreur lors de la création de la table leads:', err.message);
                    callback(err);
                    return;
                  }
                  console.log('Table leads créée avec succès.');
                  callback(null);
                });
              } else {
                console.log('La table leads existe déjà.');
                callback(null);
              }
            };
            
            createLeadsIfNeeded((leadsErr) => {
              // Si erreur, continuer quand même
              
              // 4. Insérer quelques données d'exemple
              const now = new Date().toISOString();
              
              db.run(`
                INSERT INTO projects (
                  name, type, description, start_date, end_date, 
                  status, amount, created_at, updated_at
                ) VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                'Site web corporate', 'web', 'Refonte complète du site web de l\'entreprise', 
                now.split('T')[0], new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
                'active', 5000, now, now,
                
                'Application mobile', 'mobile', 'Développement d\'une application iOS et Android', 
                new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
                new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
                'planning', 12000, now, now
              ], (err) => {
                if (err) {
                  console.error('Erreur lors de l\'insertion des données d\'exemple:', err.message);
                  console.log('La table a été créée mais sans données d\'exemple.');
                } else {
                  console.log('Données d\'exemple insérées avec succès.');
                }
                
                // 5. Créer la table tasks si elle n'existe pas encore
                db.run(`
                  CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    deadline DATE,
                    completed BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                  )
                `, (tasksErr) => {
                  if (tasksErr) {
                    console.error('Erreur lors de la création de la table tasks:', tasksErr.message);
                    // Continuer malgré l'erreur
                  } else {
                    console.log('Table tasks créée ou vérifiée avec succès.');
                  }
                  
                  // Valider la transaction
                  db.run("COMMIT", (err) => {
                    if (err) {
                      console.error('Erreur lors de la validation de la transaction:', err.message);
                      rollback();
                      return;
                    }
                    
                    console.log("Migration terminée avec succès!");
                    
                    // Réactiver les clés étrangères
                    db.run("PRAGMA foreign_keys = ON", (err) => {
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
        });
      });
    });
  });
}

function rollback() {
  db.run("ROLLBACK", (err) => {
    if (err) {
      console.error('Erreur lors de l\'annulation de la transaction:', err.message);
    }
    
    console.log("Migration annulée. Aucune modification n'a été apportée à la base de données.");
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