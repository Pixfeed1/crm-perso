// create-user.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

// Paramètres de l'utilisateur à créer
const USER = {
  username: 'moosyne',
  email: 'moosyne@gmail.com',
  password: 'Vashthestampede2a.', // Mot de passe spécifié avec le point à la fin
  role: 'admin'
};

// Connexion à la base de données
const dbPath = path.resolve(__dirname, 'database.db');
console.log(`[CREATE USER] Connexion à la base de données: ${dbPath}`);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[CREATE USER] Erreur de connexion à la base de données:', err);
    process.exit(1);
  }
  console.log('[CREATE USER] Connexion établie à la base de données SQLite');
});

// Créer l'utilisateur
async function createUser() {
  try {
    // 1. Vérifier si l'utilisateur existe déjà
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', 
      [USER.email, USER.username], 
      async (err, row) => {
        if (err) {
          console.error('[CREATE USER] Erreur lors de la vérification de l\'utilisateur:', err);
          closeAndExit(1);
        }
        
        if (row) {
          console.log('[CREATE USER] Un utilisateur avec cet email ou ce nom d\'utilisateur existe déjà.');
          console.log('[CREATE USER] Suppression de l\'utilisateur existant...');
          
          // Supprimer l'utilisateur existant
          db.run('DELETE FROM users WHERE id = ?', [row.id], (err) => {
            if (err) {
              console.error('[CREATE USER] Erreur lors de la suppression:', err);
              closeAndExit(1);
            }
            console.log('[CREATE USER] Utilisateur existant supprimé avec succès.');
            insertNewUser();
          });
        } else {
          insertNewUser();
        }
      });
    
  } catch (error) {
    console.error('[CREATE USER] Erreur:', error);
    closeAndExit(1);
  }
}

function insertNewUser() {
  // 2. Hacher le mot de passe
  bcrypt.hash(USER.password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('[CREATE USER] Erreur lors du hachage du mot de passe:', err);
      closeAndExit(1);
    }
    
    console.log('[CREATE USER] Mot de passe haché avec succès');
    
    // 3. Insérer le nouvel utilisateur
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO users (username, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [USER.username, USER.email, hashedPassword, USER.role, now, now],
      function(err) {
        if (err) {
          console.error('[CREATE USER] Erreur lors de la création de l\'utilisateur:', err);
          closeAndExit(1);
        }
        
        console.log(`[CREATE USER] Utilisateur créé avec succès! ID: ${this.lastID}`);
        console.log(`[CREATE USER] Email: ${USER.email}`);
        console.log(`[CREATE USER] Nom d'utilisateur: ${USER.username}`);
        console.log(`[CREATE USER] Rôle: ${USER.role}`);
        closeAndExit(0);
      }
    );
  });
}

function closeAndExit(code) {
  db.close((err) => {
    if (err) {
      console.error('[CREATE USER] Erreur lors de la fermeture de la connexion:', err);
    }
    console.log('[CREATE USER] Connexion à la base de données fermée');
    process.exit(code);
  });
}

// Exécuter la création
createUser();