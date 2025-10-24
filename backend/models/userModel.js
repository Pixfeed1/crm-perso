// backend/models/userModel.js

// Récupérer l'instance de la base de données
const db = require('../config/pgConfig');

// Obtenir un utilisateur par son nom d'utilisateur
const getUserByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) {
        reject(err);
      } else {
        resolve(user);
      }
    });
  });
};

// Obtenir un utilisateur par son ID
const getUserById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
      if (err) {
        reject(err);
      } else {
        resolve(user);
      }
    });
  });
};

// Vérifier le mot de passe
const verifyPassword = (password, hashedPassword) => {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(password, hashedPassword);
};

module.exports = {
  getUserByUsername,
  getUserById,
  verifyPassword
};