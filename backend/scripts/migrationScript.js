// backend/scripts/migrationScript.js

/**
 * Script de migration pour renommer les colonnes de la table goals
 * de français vers anglais
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
  startMigration();
});

function startMigration() {
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
      
      // 1. Vérifier que la table goals existe
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'", (err, table) => {
        if (err || !table) {
          console.error('La table goals n\'existe pas:', err ? err.message : 'Table non trouvée');
          rollback();
          return;
        }
        
        // 2. Récupérer la structure actuelle de la table
        db.all("PRAGMA table_info(goals)", (err, columns) => {
          if (err) {
            console.error('Erreur lors de la récupération de la structure de la table:', err.message);
            rollback();
            return;
          }
          
          console.log('Structure actuelle de la table goals:');
          console.log(columns);
          
          // 3. Récupérer toutes les données existantes
          db.all("SELECT * FROM goals", (err, rows) => {
            if (err) {
              console.error('Erreur lors de la récupération des données:', err.message);
              rollback();
              return;
            }
            
            console.log(`${rows.length} objectifs trouvés dans la base de données.`);
            
            // 4. Renommer la table existante
            db.run("ALTER TABLE goals RENAME TO goals_old", (err) => {
              if (err) {
                console.error('Erreur lors du renommage de la table:', err.message);
                rollback();
                return;
              }
              
              // 5. Créer la nouvelle table avec les noms en anglais
              db.run(`
                CREATE TABLE goals (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  description TEXT,
                  target_value REAL NOT NULL,
                  current_value REAL DEFAULT 0,
                  category TEXT NOT NULL,
                  period TEXT NOT NULL,
                  start_date TEXT NOT NULL,
                  end_date TEXT NOT NULL,
                  created_at TEXT,
                  updated_at TEXT
                )
              `, (err) => {
                if (err) {
                  console.error('Erreur lors de la création de la nouvelle table:', err.message);
                  rollback();
                  return;
                }
                
                // 6. Migrer les données
                const stmt = db.prepare(`
                  INSERT INTO goals (
                    id, name, description, target_value, current_value, 
                    category, period, start_date, end_date, created_at, updated_at
                  ) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                try {
                  rows.forEach(row => {
                    stmt.run(
                      row.id,
                      row.nom,
                      row.description,
                      row.target_value,
                      row.current_value,
                      row.categorie,
                      row.periode,
                      row.start_date,
                      row.end_date,
                      row.created_at,
                      row.updated_at
                    );
                  });
                  
                  stmt.finalize();
                  
                  // 7. Recréer les indices et contraintes si nécessaire
                  // Note: Adaptez cette partie selon vos besoins spécifiques
                  
                  // 8. Mettre à jour la table milestones si elle existe (pour la clé étrangère)
                  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='milestones'", (err, table) => {
                    if (err) {
                      console.error('Erreur lors de la vérification de la table milestones:', err.message);
                      rollback();
                      return;
                    }
                    
                    if (table) {
                      // Il y a une table milestones, mettre à jour sa structure pour la compatibilité
                      db.all("SELECT * FROM milestones", (err, milestones) => {
                        if (err) {
                          console.error('Erreur lors de la récupération des milestones:', err.message);
                          rollback();
                          return;
                        }
                        
                        // Renommer l'ancienne table
                        db.run("ALTER TABLE milestones RENAME TO milestones_old", (err) => {
                          if (err) {
                            console.error('Erreur lors du renommage de la table milestones:', err.message);
                            rollback();
                            return;
                          }
                          
                          // Créer la nouvelle table milestones
                          db.run(`
                            CREATE TABLE milestones (
                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                              goal_id INTEGER NOT NULL,
                              name TEXT NOT NULL,
                              target REAL NOT NULL,
                              achieved BOOLEAN DEFAULT 0,
                              FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
                            )
                          `, (err) => {
                            if (err) {
                              console.error('Erreur lors de la création de la nouvelle table milestones:', err.message);
                              rollback();
                              return;
                            }
                            
                            // Migrer les données des milestones
                            const milestonesStmt = db.prepare(`
                              INSERT INTO milestones (id, goal_id, name, target, achieved)
                              VALUES (?, ?, ?, ?, ?)
                            `);
                            
                            try {
                              milestones.forEach(milestone => {
                                milestonesStmt.run(
                                  milestone.id,
                                  milestone.goal_id,
                                  milestone.name,
                                  milestone.target,
                                  milestone.achieved
                                );
                              });
                              
                              milestonesStmt.finalize();
                              
                              // Supprimer les anciennes tables
                              cleanupOldTables();
                            } catch (error) {
                              console.error('Erreur lors de la migration des milestones:', error.message);
                              rollback();
                            }
                          });
                        });
                      });
                    } else {
                      // Pas de table milestones, nettoyer les anciennes tables
                      cleanupOldTables();
                    }
                  });
                } catch (error) {
                  console.error('Erreur lors de la migration des données:', error.message);
                  rollback();
                }
              });
            });
          });
        });
      });
    });
  });
}

function cleanupOldTables() {
  // Supprimer les anciennes tables après avoir migré toutes les données
  db.run("DROP TABLE IF EXISTS goals_old", (err) => {
    if (err) {
      console.error('Erreur lors de la suppression de l\'ancienne table goals:', err.message);
      rollback();
      return;
    }
    
    db.run("DROP TABLE IF EXISTS milestones_old", (err) => {
      if (err) {
        console.error('Erreur lors de la suppression de l\'ancienne table milestones:', err.message);
        rollback();
        return;
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