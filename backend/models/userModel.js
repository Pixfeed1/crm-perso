// backend/models/userModel.js

// Récupérer l'instance de la base de données
const db = require('../config/dbConfig');

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

// Obtenir un utilisateur par son email
const getUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
      if (err) {
        reject(err);
      } else {
        resolve(user);
      }
    });
  });
};

// Sauvegarder le token de réinitialisation
const saveResetToken = (userId, token, expires) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [token, expires, userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
};

// Obtenir un utilisateur par son token de réinitialisation
const getUserByResetToken = (token) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?',
      [token, Date.now()],
      (err, user) => {
        if (err) {
          reject(err);
        } else {
          resolve(user);
        }
      }
    );
  });
};

// Mettre à jour le mot de passe
const updatePassword = (userId, hashedPassword) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
};

// Effacer le token de réinitialisation
const clearResetToken = (userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
};

module.exports = {
  getUserByUsername,
  getUserById,
  verifyPassword,
  getUserByEmail,
  saveResetToken,
  getUserByResetToken,
  updatePassword,
  clearResetToken
};