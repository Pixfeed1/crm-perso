// backend/models/userModel.js

// Récupérer l'instance de la base de données
const db = require('../config/pgConfig');
const bcrypt = require('bcrypt');

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

// Obtenir tous les utilisateurs (sans les mots de passe)
const getAllUsers = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, username, email, role, created_at, updated_at FROM users', [], (err, users) => {
      if (err) {
        reject(err);
      } else {
        resolve(users);
      }
    });
  });
};

// Créer un nouvel utilisateur
const createUser = async (userData) => {
  const { username, email, password, role = 'user' } = userData;

  // Valider les données
  if (!username || !password) {
    throw new Error('Le nom d\'utilisateur et le mot de passe sont requis');
  }

  // Valider le rôle
  const validRoles = ['admin', 'manager', 'user'];
  if (!validRoles.includes(role)) {
    throw new Error('Rôle invalide');
  }

  // Hacher le mot de passe
  const hashedPassword = await bcrypt.hash(password, 10);

  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role],
      function (err) {
        if (err) {
          if (err.message?.includes('UNIQUE') || err.message?.includes('duplicate')) {
            reject(new Error('Ce nom d\'utilisateur ou email existe déjà'));
          } else {
            reject(err);
          }
        } else {
          // Retourner l'utilisateur créé sans le mot de passe
          resolve({
            id: this.lastID,
            username,
            email,
            role,
            created_at: new Date()
          });
        }
      }
    );
  });
};

// Mettre à jour un utilisateur
const updateUser = async (id, userData) => {
  const { username, email, role } = userData;

  // Construire la requête dynamiquement selon les champs fournis
  const fields = [];
  const values = [];

  if (username) {
    fields.push('username = ?');
    values.push(username);
  }
  if (email !== undefined) {
    fields.push('email = ?');
    values.push(email);
  }
  if (role) {
    const validRoles = ['admin', 'manager', 'user'];
    if (!validRoles.includes(role)) {
      throw new Error('Rôle invalide');
    }
    fields.push('role = ?');
    values.push(role);
  }

  if (fields.length === 0) {
    throw new Error('Aucun champ à mettre à jour');
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

  return new Promise((resolve, reject) => {
    db.run(query, values, function (err) {
      if (err) {
        if (err.message?.includes('UNIQUE') || err.message?.includes('duplicate')) {
          reject(new Error('Ce nom d\'utilisateur ou email existe déjà'));
        } else {
          reject(err);
        }
      } else {
        if (this.changes === 0) {
          reject(new Error('Utilisateur non trouvé'));
        } else {
          // Récupérer l'utilisateur mis à jour
          getUserById(id).then(resolve).catch(reject);
        }
      }
    });
  });
};

// Changer le mot de passe
const changePassword = async (userId, oldPassword, newPassword) => {
  // Récupérer l'utilisateur
  const user = await getUserById(userId);

  if (!user) {
    throw new Error('Utilisateur non trouvé');
  }

  // Vérifier l'ancien mot de passe
  const isValid = await bcrypt.compare(oldPassword, user.password);
  if (!isValid) {
    throw new Error('Ancien mot de passe incorrect');
  }

  // Hacher le nouveau mot de passe
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, userId],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ message: 'Mot de passe modifié avec succès' });
        }
      }
    );
  });
};

// Réinitialiser le mot de passe (pour admin ou récupération)
const resetPassword = async (userId, newPassword) => {
  // Hacher le nouveau mot de passe
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, userId],
      function (err) {
        if (err) {
          reject(err);
        } else {
          if (this.changes === 0) {
            reject(new Error('Utilisateur non trouvé'));
          } else {
            resolve({ message: 'Mot de passe réinitialisé avec succès' });
          }
        }
      }
    );
  });
};

// Supprimer un utilisateur
const deleteUser = (id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
      if (err) {
        reject(err);
      } else {
        if (this.changes === 0) {
          reject(new Error('Utilisateur non trouvé'));
        } else {
          resolve({ message: 'Utilisateur supprimé avec succès' });
        }
      }
    });
  });
};

// Vérifier le mot de passe
const verifyPassword = (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

module.exports = {
  getUserByUsername,
  getUserById,
  getUserByEmail,
  getAllUsers,
  createUser,
  updateUser,
  changePassword,
  resetPassword,
  deleteUser,
  verifyPassword
};
