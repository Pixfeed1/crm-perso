// updateActivitiesTable.js
const db = require('../config/dbConfig');

// Fonction pour mettre à jour la table activities
function updateActivitiesTable() {
  console.log('Début de la mise à jour de la table activities...');
  
  // Créer une nouvelle table avec les contraintes mises à jour
  db.run(`
    CREATE TABLE IF NOT EXISTS activities_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      planned_time INTEGER,
      actual_time INTEGER DEFAULT 0,
      date DATE NOT NULL,
      priority TEXT CHECK(priority IN ('low', 'medium', 'high')),
      status TEXT CHECK(status IN ('pending', 'planned', 'in-progress', 'completed')),
      project_id INTEGER,
      lead_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects (id),
      FOREIGN KEY (lead_id) REFERENCES leads (id)
    )
  `, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table temporaire:', err);
      return;
    }
    
    // Copier les données de l'ancienne table vers la nouvelle
    db.run(`INSERT INTO activities_new SELECT * FROM activities`, (err) => {
      if (err) {
        console.error('Erreur lors de la copie des données:', err);
        return;
      }
      
      // Supprimer l'ancienne table
      db.run(`DROP TABLE activities`, (err) => {
        if (err) {
          console.error('Erreur lors de la suppression de l\'ancienne table:', err);
          return;
        }
        
        // Renommer la nouvelle table
        db.run(`ALTER TABLE activities_new RENAME TO activities`, (err) => {
          if (err) {
            console.error('Erreur lors du renommage de la table:', err);
            return;
          }
          
          console.log('Table activities mise à jour avec succès');
        });
      });
    });
  });
}

// Exécuter la mise à jour
updateActivitiesTable();