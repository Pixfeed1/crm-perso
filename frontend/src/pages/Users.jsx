// src/pages/Users.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUsers, FiUserPlus, FiEdit2, FiTrash2, FiKey, FiShield, FiX, FiSave, FiEye, FiEyeOff } from 'react-icons/fi';
import usePermissions from '../hooks/usePermissions';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({ username: '', email: '', password: '', role: 'user' });
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const { isAdmin, userId } = usePermissions();

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/users', {
        headers: {
          'Authorization': \`Bearer \${token}\`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setError('Impossible de charger les utilisateurs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.username || !formData.password) {
      setError('Le nom d\'utilisateur et le mot de passe sont requis');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/users', {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${token}\`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await fetchUsers();
        setShowUserForm(false);
        setFormData({ username: '', email: '', password: '', role: 'user' });
        setError(null);
      } else {
        const data = await response.json();
        setError(data.message || 'Erreur lors de la création');
      }
    } catch (error) {
      setError('Erreur lors de la création de l\'utilisateur');
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.id === userId) {
      setError('Vous ne pouvez pas supprimer votre propre compte');
      return;
    }

    if (!window.confirm(\`Êtes-vous sûr de vouloir supprimer \${user.username} ?\`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(\`http://localhost:5000/api/users/\${user.id}\`, {
        method: 'DELETE',
        headers: {
          'Authorization': \`Bearer \${token}\`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await fetchUsers();
        setError(null);
      }
    } catch (error) {
      setError('Erreur lors de la suppression');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      setError('Tous les champs sont requis');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(\`http://localhost:5000/api/users/\${userId}/change-password\`, {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${token}\`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ oldPassword: passwordData.oldPassword, newPassword: passwordData.newPassword })
      });

      if (response.ok) {
        setShowPasswordModal(false);
        setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        setError(null);
        alert('Mot de passe modifié avec succès');
      } else {
        const data = await response.json();
        setError(data.message);
      }
    } catch (error) {
      setError('Erreur lors du changement de mot de passe');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <FiShield className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Accès Refusé</h2>
          <p className="text-gray-400">Cette page est réservée aux administrateurs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 mb-2">
            Gestion des Utilisateurs
          </h1>
          <p className="text-gray-400">Gérez les comptes et les permissions</p>
        </div>
        <div className="flex gap-3">
          <motion.button
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            whileHover={{ scale: 1.05 }}
          >
            <FiKey />
            Changer mon mot de passe
          </motion.button>
          <motion.button
            onClick={() => {
              setSelectedUser(null);
              setFormData({ username: '', email: '', password: '', role: 'user' });
              setShowUserForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg"
            whileHover={{ scale: 1.05 }}
          >
            <FiUserPlus />
            Nouvel Utilisateur
          </motion.button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-rose-500/20 border border-rose-500/50 rounded-lg text-rose-300">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="text-left py-4 px-6 text-gray-300">Utilisateur</th>
                  <th className="text-left py-4 px-6 text-gray-300">Email</th>
                  <th className="text-left py-4 px-6 text-gray-300">Rôle</th>
                  <th className="text-left py-4 px-6 text-gray-300">Créé le</th>
                  <th className="text-right py-4 px-6 text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white">{user.username}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-gray-300">{user.email || '-'}</td>
                    <td className="py-4 px-6">
                      <span className={\`px-3 py-1 rounded-full text-sm \${
                        user.role === 'admin' ? 'bg-rose-500/20 text-rose-300' :
                        user.role === 'manager' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-gray-500/20 text-gray-300'
                      }\`}>
                        {user.role === 'admin' ? 'Admin' : user.role === 'manager' ? 'Manager' : 'Utilisateur'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-400">
                      {new Date(user.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-2 hover:bg-gray-600 rounded-lg text-rose-400"
                          disabled={user.id === userId}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Form Modal */}
      <AnimatePresence>
        {showUserForm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => setShowUserForm(false)}
          >
            <motion.div
              className="bg-gray-800 rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-6">Nouvel utilisateur</h3>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Nom d'utilisateur"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                />
                <input
                  type="password"
                  placeholder="Mot de passe"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                />
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                >
                  <option value="user">Utilisateur</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUserForm(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateUser}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg"
                  >
                    Créer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => setShowPasswordModal(false)}
          >
            <motion.div
              className="bg-gray-800 rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-6">Changer le mot de passe</h3>
              <div className="space-y-4">
                <input
                  type="password"
                  placeholder="Ancien mot de passe"
                  value={passwordData.oldPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                />
                <input
                  type="password"
                  placeholder="Nouveau mot de passe"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                />
                <input
                  type="password"
                  placeholder="Confirmer le mot de passe"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleChangePassword}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg"
                  >
                    Changer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Users;
