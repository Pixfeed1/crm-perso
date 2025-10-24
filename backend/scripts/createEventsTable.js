// backend/scripts/createEventsTable.js

/**
 * Script de migration pour créer la table events
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
  createEventsTable();
});

function createEventsTable() {
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
      
      // 1. Vérifier si la table events existe déjà
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='events'", (err, table) => {
        if (err) {
          console.error('Erreur lors de la vérification de la table events:', err.message);
          rollback();
          return;
        }
        
        if (table) {
          console.log('La table events existe déjà. Aucune action nécessaire.');
          // Valider la transaction et terminer
          db.run("COMMIT", (err) => {
            if (err) {
              console.error('Erreur lors de la validation de la transaction:', err.message);
              rollback();
              return;
            }
            
            console.log("La table events existe déjà, aucune modification effectuée.");
            cleanup(0);
          });
          return;
        }
        
        console.log('La table events n\'existe pas. Création en cours...');
        
        // 2. Créer la table events
        db.run(`
          CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            start_datetime TEXT NOT NULL,
            end_datetime TEXT NOT NULL,
            all_day INTEGER DEFAULT 0,
            location TEXT,
            category TEXT,
            priority TEXT DEFAULT 'medium',
            color TEXT,
            reminder_time TEXT,
            activity_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('Erreur lors de la création de la table events:', err.message);
            rollback();
            return;
          }
          
          console.log('Table events créée avec succès.');
          
          // 3. Insérer quelques données d'exemple
          const now = new Date().toISOString();
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString();
          
          // Date du jour à 10h
          const today10am = new Date();
          today10am.setHours(10, 0, 0, 0);
          const today10amStr = today10am.toISOString();
          
          // Date du jour à 11h30
          const today1130am = new Date();
          today1130am.setHours(11, 30, 0, 0);
          const today1130amStr = today1130am.toISOString();
          
          db.run(`
            INSERT INTO events (
              title, description, start_datetime, end_datetime, all_day, 
              location, category, priority, color, created_at
            )
            VALUES 
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            'Réunion d\'équipe', 'Discussion sur les projets en cours', today10amStr, today1130amStr, 0, 
            'Salle de conférence', 'meeting', 'medium', '#3B82F6', now,
            
            'Appel client', 'Présentation des nouvelles fonctionnalités', tomorrowStr, 
            new Date(new Date(tomorrowStr).getTime() + 60*60*1000).toISOString(), 0, 
            'Visioconférence', 'call', 'high', '#10B981', now
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