// backend/scripts/updateProjectsTable.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Chemin vers la base de données
const dbPath = path.join(__dirname, '..', 'database.db');

// Sauvegarde
const backupPath = path.join(__dirname, '..', `database_backup_${Date.now()}.db`);
fs.copyFileSync(dbPath, backupPath);
console.log(`Sauvegarde de la base de données créée: ${backupPath}`);

// Connexion
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erreur lors de la connexion à la base de données:', err.message);
    process.exit(1);
  }
  console.log('Connexion à la base de données établie.');
  
  // Commencer les modifications
  updateProjectsTable();
});

function updateProjectsTable() {
  // Vérifier si la colonne lead_id existe déjà
  db.get("PRAGMA table_info(projects)", (err, columns) => {
    if (err) {
      console.error('Erreur lors de la vérification des colonnes:', err.message);
      cleanup(1);
      return;
    }
    
    // Commencer une transaction
    db.run("BEGIN TRANSACTION", (err) => {
      if (err) {
        console.error('Erreur lors du démarrage de la transaction:', err.message);
        cleanup(1);
        return;
      }
      
      // Vérifier si la table leads existe, sinon la créer
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'", (err, leadsTable) => {
        if (err) {
          console.error('Erreur lors de la vérification de la table leads:', err.message);
          rollback();
          return;
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
              
              // Insérer quelques leads d'exemple
              const now = new Date().toISOString();
              
              db.run(`
                INSERT INTO leads (name, email, status, created_at, updated_at)
                VALUES 
                (?, ?, ?, ?, ?),
                (?, ?, ?, ?, ?)
              `, [
                'Entreprise ABC', 'contact@abc.com', 'qualified', now, now,
                'John Doe', 'john@example.com', 'new', now, now
              ], (err) => {
                if (err) {
                  console.error('Erreur lors de l\'insertion des leads d\'exemple:', err.message);
                  // Continuer même en cas d'erreur
                }
                
                console.log('Table leads créée avec succès.');
                callback(null);
              });
            });
          } else {
            console.log('La table leads existe déjà.');
            callback(null);
          }
        };
        
        createLeadsIfNeeded((leadsErr) => {
          if (leadsErr) {
            rollback();
            return;
          }
          
          // Vérifier si la colonne lead_id existe dans la table projects
          db.all("PRAGMA table_info(projects)", (err, columns) => {
            if (err) {
              console.error('Erreur lors de la vérification des colonnes de la table projects:', err.message);
              rollback();
              return;
            }
            
            const hasLeadIdColumn = columns.some(col => col.name === 'lead_id');
            
            if (hasLeadIdColumn) {
              console.log('La colonne lead_id existe déjà dans la table projects.');
              db.run("COMMIT", (err) => {
                if (err) console.error('Erreur lors de la validation de la transaction:', err.message);
                cleanup(0);
              });
            } else {
              console.log('Ajout de la colonne lead_id à la table projects...');
              
              // Ajouter la colonne lead_id
              db.run("ALTER TABLE projects ADD COLUMN lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL", (err) => {
                if (err) {
                  console.error('Erreur lors de l\'ajout de la colonne lead_id:', err.message);
                  rollback();
                  return;
                }
                
                console.log('Colonne lead_id ajoutée avec succès.');
                
                // Mettre à jour quelques projets avec des lead_id
                db.get("SELECT id FROM leads LIMIT 1", (err, lead) => {
                  if (err || !lead) {
                    console.log('Aucun lead trouvé pour mettre à jour les projets.');
                    db.run("COMMIT", (err) => {
                      if (err) console.error('Erreur lors de la validation de la transaction:', err.message);
                      cleanup(0);
                    });
                    return;
                  }
                  
                  db.run("UPDATE projects SET lead_id = ? WHERE id IN (SELECT id FROM projects LIMIT 1)", [lead.id], (err) => {
                    if (err) {
                      console.error('Erreur lors de la mise à jour des projets avec des lead_id:', err.message);
                      // Continuer malgré l'erreur
                    } else {
                      console.log('Projets mis à jour avec des lead_id.');
                    }
                    
                    db.run("COMMIT", (err) => {
                      if (err) console.error('Erreur lors de la validation de la transaction:', err.message);
                      cleanup(0);
                    });
                  });
                });
              });
            }
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
    
    console.log("Mise à jour annulée. Aucune modification n'a été apportée à la base de données.");
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