// backend/models/userModel.js

/**
 * Modèle pour la gestion des utilisateurs
 * Pattern standardisé: chaque fonction prend db comme premier paramètre
 */

/**
 * Obtenir un utilisateur par son nom d'utilisateur
 * @param {object} db - Instance de la base de données
 * @param {string} username - Nom d'utilisateur
 * @returns {Promise} - Promesse contenant l'utilisateur
 */
const getUserByUsername = (db, username) => {
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

/**
 * Obtenir un utilisateur par son ID
 * @param {object} db - Instance de la base de données
 * @param {number} id - ID de l'utilisateur
 * @returns {Promise} - Promesse contenant l'utilisateur
 */
const getUserById = (db, id) => {
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

/**
 * Vérifier le mot de passe
 * @param {string} password - Mot de passe en clair
 * @param {string} hashedPassword - Mot de passe haché
 * @returns {Promise} - Promesse de comparaison
 */
const verifyPassword = (password, hashedPassword) => {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Obtenir un utilisateur par son email
 * @param {object} db - Instance de la base de données
 * @param {string} email - Email de l'utilisateur
 * @returns {Promise} - Promesse contenant l'utilisateur
 */
const getUserByEmail = (db, email) => {
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

/**
 * Sauvegarder le token de réinitialisation
 * @param {object} db - Instance de la base de données
 * @param {number} userId - ID de l'utilisateur
 * @param {string} token - Token de réinitialisation
 * @param {number} expires - Date d'expiration
 * @returns {Promise} - Promesse de succès
 */
const saveResetToken = (db, userId, token, expires) => {
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

/**
 * Obtenir un utilisateur par son token de réinitialisation
 * @param {object} db - Instance de la base de données
 * @param {string} token - Token de réinitialisation
 * @returns {Promise} - Promesse contenant l'utilisateur
 */
const getUserByResetToken = (db, token) => {
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

/**
 * Mettre à jour le mot de passe
 * @param {object} db - Instance de la base de données
 * @param {number} userId - ID de l'utilisateur
 * @param {string} hashedPassword - Mot de passe haché
 * @returns {Promise} - Promesse de succès
 */
const updatePassword = (db, userId, hashedPassword) => {
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

/**
 * Effacer le token de réinitialisation
 * @param {object} db - Instance de la base de données
 * @param {number} userId - ID de l'utilisateur
 * @returns {Promise} - Promesse de succès
 */
const clearResetToken = (db, userId) => {
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
