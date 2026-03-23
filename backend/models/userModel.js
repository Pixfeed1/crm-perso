// backend/models/userModel.js

/**
 * Modele pour la gestion des utilisateurs
 * Pattern standardise: chaque fonction prend db comme premier parametre
 */

// Colonnes de base (garanties d'exister)
const USER_COLUMNS = 'id, username, email, role, created_at, updated_at';
const USER_COLUMNS_WITH_PASSWORD = 'id, username, email, password, role, created_at, updated_at';

/**
 * Obtenir un utilisateur par son nom d'utilisateur (avec password pour auth)
 */
const getUserByUsername = (db, username) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT ${USER_COLUMNS_WITH_PASSWORD} FROM users WHERE username = ?`, [username], (err, user) => {
      if (err) reject(err);
      else resolve(user);
    });
  });
};

/**
 * Obtenir un utilisateur par son ID (sans password)
 */
const getUserById = (db, id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id], (err, user) => {
      if (err) reject(err);
      else resolve(user);
    });
  });
};

/**
 * Verifier le mot de passe
 */
const verifyPassword = (password, hashedPassword) => {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Obtenir un utilisateur par son email (sans password)
 */
const getUserByEmail = (db, email) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [email], (err, user) => {
      if (err) reject(err);
      else resolve(user);
    });
  });
};

/**
 * Sauvegarder le token de reinitialisation
 */
const saveResetToken = (db, userId, token, expires) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [token, expires, userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

/**
 * Obtenir un utilisateur par son token de reinitialisation
 */
const getUserByResetToken = (db, token) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT ${USER_COLUMNS} FROM users WHERE reset_token = ? AND reset_token_expires > ?`,
      [token, Date.now()],
      (err, user) => {
        if (err) reject(err);
        else resolve(user);
      }
    );
  });
};

/**
 * Mettre a jour le mot de passe
 */
const updatePassword = (db, userId, hashedPassword) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

/**
 * Effacer le token de reinitialisation
 */
const clearResetToken = (db, userId) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [userId],
      (err) => {
        if (err) reject(err);
        else resolve();
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
