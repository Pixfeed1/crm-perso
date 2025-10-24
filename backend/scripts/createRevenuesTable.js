// backend/scripts/createRevenuesTable.js

/**
 * Script de migration pour créer la table revenues
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
  createRevenuesTable();
});

function createRevenuesTable() {
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
      
      // 1. Vérifier si la table revenues existe déjà
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='revenues'", (err, table) => {
        if (err) {
          console.error('Erreur lors de la vérification de la table revenues:', err.message);
          rollback();
          return;
        }
        
        if (table) {
          console.log('La table revenues existe déjà. Aucune action nécessaire.');
          // Valider la transaction et terminer
          db.run("COMMIT", (err) => {
            if (err) {
              console.error('Erreur lors de la validation de la transaction:', err.message);
              rollback();
              return;
            }
            
            console.log("La table revenues existe déjà, aucune modification effectuée.");
            cleanup(0);
          });
          return;
        }
        
        console.log('La table revenues n\'existe pas. Création en cours...');
        
        // 2. Créer la table revenues
        db.run(`
          CREATE TABLE revenues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            project_id INTEGER,
            type TEXT DEFAULT 'invoice',
            status TEXT DEFAULT 'pending',
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('Erreur lors de la création de la table revenues:', err.message);
            rollback();
            return;
          }
          
          console.log('Table revenues créée avec succès.');
          
          // 3. Insérer quelques données d'exemple (optionnel)
          const now = new Date().toISOString();
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          
          db.run(`
            INSERT INTO revenues (amount, date, description, type, status, created_at, updated_at)
            VALUES 
            (1500, ?, 'Acompte site web', 'invoice', 'paid', ?, ?),
            (2000, ?, 'Maintenance mensuelle', 'recurring', 'pending', ?, ?)
          `, [
            now.split('T')[0], now, now,
            yesterdayStr, now, now
          ], (err) => {
            if (err) {
              console.error('Erreur lors de l\'insertion des données d\'exemple:', err.message);
              console.log('La table a été créée mais sans données d\'exemple.');
            } else {
              console.log('Données d\'exemple insérées avec succès.');
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