// backend/middleware/permissionsMiddleware.js

/**
 * Middleware de gestion des permissions basées sur les rôles
 *
 * Rôles disponibles:
 * - admin: Accès complet (CRUD sur tout)
 * - manager: Peut créer, lire, modifier (pas supprimer)
 * - user: Peut lire et créer seulement
 */

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user'
};

const PERMISSIONS = {
  // Permissions pour chaque rôle
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

/**
 * Vérifie si l'utilisateur a une permission spécifique
 * @param {string} role - Rôle de l'utilisateur
 * @param {string} permission - Permission à vérifier
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  if (!role || !PERMISSIONS[role]) {
    return false;
  }
  return PERMISSIONS[role][permission] === true;
}

/**
 * Middleware pour vérifier qu'un utilisateur a une permission spécifique
 * @param {string} permission - Permission requise ('create', 'read', 'update', 'delete', 'manageUsers')
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const userRole = req.user?.role || 'user';

    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        message: `Permission refusée. Cette action nécessite la permission '${permission}'.`,
        required_permission: permission,
        your_role: userRole
      });
    }

    next();
  };
}

/**
 * Middleware pour vérifier qu'un utilisateur a un rôle minimum
 * @param {string} minimumRole - Rôle minimum requis ('admin', 'manager', 'user')
 */
function requireRole(minimumRole) {
  return (req, res, next) => {
    const userRole = req.user?.role || 'user';

    // Hiérarchie des rôles
    const roleHierarchy = {
      user: 1,
      manager: 2,
      admin: 3
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 999;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        message: `Accès refusé. Rôle minimum requis: ${minimumRole}`,
        required_role: minimumRole,
        your_role: userRole
      });
    }

    next();
  };
}

/**
 * Middleware pour vérifier qu'un utilisateur ne peut modifier que ses propres données
 * ou qu'il est admin
 */
function requireOwnershipOrAdmin(userIdParam = 'id') {
  return (req, res, next) => {
    const currentUserId = req.user?.id;
    const targetUserId = parseInt(req.params[userIdParam]) || parseInt(req.body.user_id);
    const userRole = req.user?.role || 'user';

    // Les admins peuvent tout faire
    if (userRole === 'admin') {
      return next();
    }

    // Les autres ne peuvent modifier que leurs propres données
    if (currentUserId !== targetUserId) {
      return res.status(403).json({
        message: 'Vous ne pouvez modifier que vos propres données',
        your_id: currentUserId,
        target_id: targetUserId
      });
    }

    next();
  };
}

/**
 * Middleware pour filtrer automatiquement les données par user_id
 * sauf pour les admins qui voient tout
 */
function applyUserFilter(req, res, next) {
  const userRole = req.user?.role || 'user';
  const userId = req.user?.id;

  // Les admins voient tout
  if (userRole === 'admin') {
    req.viewAll = true;
  } else {
    req.viewAll = false;
    req.filteredUserId = userId;
  }

  next();
}

/**
 * Vérifie si l'utilisateur connecté est admin
 */
function isAdmin(req) {
  return req.user?.role === 'admin';
}

/**
 * Vérifie si l'utilisateur connecté est au moins manager
 */
function isManagerOrAbove(req) {
  const role = req.user?.role || 'user';
  return role === 'admin' || role === 'manager';
}

module.exports = {
  ROLES,
  PERMISSIONS,
  hasPermission,
  requirePermission,
  requireRole,
  requireOwnershipOrAdmin,
  applyUserFilter,
  isAdmin,
  isManagerOrAbove
};
