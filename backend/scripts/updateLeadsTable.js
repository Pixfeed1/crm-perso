// backend/scripts/updateLeadsTable.js

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
  updateLeadsTable();
});

function updateLeadsTable() {
  // Vérifier si la table leads existe
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='leads'", (err, tableExists) => {
    if (err) {
      console.error('Erreur lors de la vérification de la table leads:', err.message);
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
      
      if (!tableExists) {
        // Créer la table leads si elle n'existe pas
        console.log('La table leads n\'existe pas. Création en cours...');
        
        db.run(`
          CREATE TABLE leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            company TEXT,
            email TEXT,
            phone TEXT,
            type TEXT DEFAULT 'individual',
            status TEXT DEFAULT 'new',
            source TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
          )
        `, (err) => {
          if (err) {
            console.error('Erreur lors de la création de la table leads:', err.message);
            rollback();
            return;
          }
          
          console.log('Table leads créée avec succès.');
          
          db.run("COMMIT", (err) => {
            if (err) console.error('Erreur lors de la validation de la transaction:', err.message);
            cleanup(0);
          });
        });
      } else {
        // La table existe, vérifions les colonnes manquantes
        db.all("PRAGMA table_info(leads)", (err, columns) => {
          if (err) {
            console.error('Erreur lors de la récupération des colonnes de la table leads:', err.message);
            rollback();
            return;
          }
          
          // Vérifier quelles colonnes existent
          const columnNames = columns.map(col => col.name);
          const missingColumns = [];
          
          if (!columnNames.includes('type')) {
            missingColumns.push({
              name: 'type',
              sql: "ALTER TABLE leads ADD COLUMN type TEXT DEFAULT 'individual'"
            });
          }
          
          if (!columnNames.includes('source')) {
            missingColumns.push({
              name: 'source',
              sql: "ALTER TABLE leads ADD COLUMN source TEXT"
            });
          }
          
          if (!columnNames.includes('notes')) {
            missingColumns.push({
              name: 'notes',
              sql: "ALTER TABLE leads ADD COLUMN notes TEXT"
            });
          }
          
          // Si aucune colonne n'est manquante
          if (missingColumns.length === 0) {
            console.log('La table leads est déjà à jour avec toutes les colonnes requises.');
            db.run("COMMIT", (err) => {
              if (err) console.error('Erreur lors de la validation de la transaction:', err.message);
              cleanup(0);
            });
            return;
          }
          
          // Ajouter les colonnes manquantes une par une
          let columnIndex = 0;
          
          const addNextColumn = () => {
            if (columnIndex >= missingColumns.length) {
              console.log('Toutes les colonnes ont été ajoutées avec succès.');
              db.run("COMMIT", (err) => {
                if (err) console.error('Erreur lors de la validation de la transaction:', err.message);
                cleanup(0);
              });
              return;
            }
            
            const column = missingColumns[columnIndex];
            console.log(`Ajout de la colonne '${column.name}'...`);
            
            db.run(column.sql, (err) => {
              if (err) {
                console.error(`Erreur lors de l'ajout de la colonne '${column.name}':`, err.message);
                rollback();
                return;
              }
              
              console.log(`Colonne '${column.name}' ajoutée avec succès.`);
              columnIndex++;
              addNextColumn();
            });
          };
          
          // Démarrer l'ajout des colonnes
          addNextColumn();
        });
      }
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