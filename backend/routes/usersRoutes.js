// backend/routes/usersRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission, requireRole, requireOwnershipOrAdmin } = require('../middleware/permissionsMiddleware');
const userModel = require('../models/userModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

/**
 * GET /api/users
 * Obtenir tous les utilisateurs (admin only)
 */
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const users = await userModel.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * GET /api/users/:id
 * Obtenir un utilisateur spécifique
 * L'utilisateur peut voir son propre profil, les admins peuvent tout voir
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Vérifier les permissions
    if (currentUserRole !== 'admin' && parseInt(id) !== currentUserId) {
      return res.status(403).json({
        message: 'Vous ne pouvez voir que votre propre profil'
      });
    }

    const user = await userModel.getUserById(id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Supprimer le mot de passe de la réponse
    delete user.password;

    res.json(user);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/users
 * Créer un nouvel utilisateur (admin only)
 */
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: 'Le nom d\'utilisateur et le mot de passe sont requis'
      });
    }

    const newUser = await userModel.createUser({ username, email, password, role });
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Erreur lors de la création de l\'utilisateur:', error);
    if (error.message.includes('existe déjà')) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * PUT /api/users/:id
 * Mettre à jour un utilisateur
 * L'utilisateur peut modifier son propre profil (sauf le rôle)
 * Les admins peuvent tout modifier
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role } = req.body;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Vérifier les permissions
    if (currentUserRole !== 'admin' && parseInt(id) !== currentUserId) {
      return res.status(403).json({
        message: 'Vous ne pouvez modifier que votre propre profil'
      });
    }

    // Seuls les admins peuvent changer les rôles
    if (role && currentUserRole !== 'admin') {
      return res.status(403).json({
        message: 'Seuls les administrateurs peuvent modifier les rôles'
      });
    }

    const updatedUser = await userModel.updateUser(id, { username, email, role });

    // Supprimer le mot de passe de la réponse
    delete updatedUser.password;

    res.json(updatedUser);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'utilisateur:', error);
    if (error.message === 'Utilisateur non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('existe déjà')) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * DELETE /api/users/:id
 * Supprimer un utilisateur (admin only)
 */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;

    // Empêcher un admin de se supprimer lui-même
    if (parseInt(id) === currentUserId) {
      return res.status(400).json({
        message: 'Vous ne pouvez pas supprimer votre propre compte'
      });
    }

    await userModel.deleteUser(id);
    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    if (error.message === 'Utilisateur non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/users/:id/change-password
 * Changer le mot de passe d'un utilisateur
 * Requiert l'ancien mot de passe pour confirmation
 */
router.post('/:id/change-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        message: 'L\'ancien et le nouveau mot de passe sont requis'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Le nouveau mot de passe doit contenir au moins 6 caractères'
      });
    }

    // Vérifier les permissions
    if (currentUserRole !== 'admin' && parseInt(id) !== currentUserId) {
      return res.status(403).json({
        message: 'Vous ne pouvez modifier que votre propre mot de passe'
      });
    }

    const result = await userModel.changePassword(id, oldPassword, newPassword);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    if (error.message === 'Ancien mot de passe incorrect') {
      return res.status(401).json({ message: error.message });
    }
    if (error.message === 'Utilisateur non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Réinitialiser le mot de passe d'un utilisateur (admin only)
 * Ne nécessite pas l'ancien mot de passe
 */
router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        message: 'Le nouveau mot de passe est requis'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Le nouveau mot de passe doit contenir au moins 6 caractères'
      });
    }

    const result = await userModel.resetPassword(id, newPassword);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    if (error.message === 'Utilisateur non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * GET /api/users/me
 * Obtenir le profil de l'utilisateur connecté
 */
router.get('/me/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userModel.getUserById(userId);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Supprimer le mot de passe
    delete user.password;

    res.json(user);
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
