// src/hooks/usePermissions.js
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook personnalisé pour gérer les permissions basées sur les rôles
 *
 * Rôles disponibles:
 * - admin: Accès complet (CRUD sur tout)
 * - manager: Peut créer, lire, modifier (pas supprimer)
 * - user: Peut lire et créer seulement
 */

const PERMISSIONS = {
  admin: {
    create: true,
    read: true,
    update: true,
    delete: true,
    manageUsers: true
  },
  manager: {
    create: true,
    read: true,
    update: true,
    delete: false,
    manageUsers: false
  },
  user: {
    create: true,
    read: true,
    update: false,
    delete: false,
    manageUsers: false
  }
};

const usePermissions = () => {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState('user');
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    if (user) {
      setUserRole(user.role || 'user');
      setUserId(user.id || user.userId);
    }
  }, [user]);

  /**
   * Vérifie si l'utilisateur a une permission spécifique
   * @param {string} permission - Permission à vérifier
   * @returns {boolean}
   */
  const hasPermission = (permission) => {
    if (!userRole || !PERMISSIONS[userRole]) {
      return false;
    }
    return PERMISSIONS[userRole][permission] === true;
  };

  /**
   * Vérifie si l'utilisateur a un rôle spécifique
   * @param {string} role - Rôle à vérifier
   * @returns {boolean}
   */
  const hasRole = (role) => {
    return userRole === role;
  };

  /**
   * Vérifie si l'utilisateur a au moins un certain niveau de rôle
   * @param {string} minimumRole - Rôle minimum requis
   * @returns {boolean}
   */
  const hasMinimumRole = (minimumRole) => {
    const roleHierarchy = {
      user: 1,
      manager: 2,
      admin: 3
    };

    const currentLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 999;

    return currentLevel >= requiredLevel;
  };

  /**
   * Vérifie si l'utilisateur peut modifier une ressource
   * @param {number} resourceUserId - ID de l'utilisateur propriétaire de la ressource
   * @returns {boolean}
   */
  const canModifyResource = (resourceUserId) => {
    // Les admins peuvent tout modifier
    if (userRole === 'admin') {
      return true;
    }

    // Les autres ne peuvent modifier que leurs propres ressources
    return userId === resourceUserId;
  };

  /**
   * Vérifie si l'utilisateur est admin
   * @returns {boolean}
   */
  const isAdmin = () => {
    return userRole === 'admin';
  };

  /**
   * Vérifie si l'utilisateur est au moins manager
   * @returns {boolean}
   */
  const isManagerOrAbove = () => {
    return userRole === 'admin' || userRole === 'manager';
  };

  /**
   * Vérifie si l'utilisateur peut accéder à la gestion des utilisateurs
   * @returns {boolean}
   */
  const canManageUsers = () => {
    return hasPermission('manageUsers');
  };

  return {
    userRole,
    userId,
    hasPermission,
    hasRole,
    hasMinimumRole,
    canModifyResource,
    isAdmin: isAdmin(),
    isManagerOrAbove: isManagerOrAbove(),
    canManageUsers: canManageUsers(),
    // Permissions individuelles pour un accès rapide
    canCreate: hasPermission('create'),
    canRead: hasPermission('read'),
    canUpdate: hasPermission('update'),
    canDelete: hasPermission('delete')
  };
};

export default usePermissions;
