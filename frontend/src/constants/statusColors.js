/**
 * Configuration centralisée des couleurs de statut pour tous les composants
 * Utilise les classes Tailwind pour cohérence avec le thème
 */

export const LEAD_STATUS_COLORS = {
  'nouveau': {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'Nouveau'
  },
  'prospect': {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'Prospect'
  },
  'qualifie': {
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    label: 'Qualifié'
  },
  'negocie': {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Négocié'
  },
  'gagne': {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Gagné'
  },
  'perdu': {
    bg: 'bg-rose-500/20',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Perdu'
  }
};

export const PROJECT_STATUS_COLORS = {
  'planifié': {
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    label: 'Planifié'
  },
  'en-cours': {
    bg: 'bg-blue-500/20',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    label: 'En cours'
  },
  'pause': {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    label: 'En pause'
  },
  'terminé': {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    label: 'Terminé'
  },
  'annulé': {
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    label: 'Annulé'
  }
};

export const ACTIVITY_STATUS_COLORS = {
  'planned': {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'Planifiée'
  },
  'in-progress': {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'En cours'
  },
  'completed': {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Terminée'
  },
  'cancelled': {
    bg: 'bg-rose-500/20',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Annulée'
  }
};

export const PRIORITY_COLORS = {
  'low': {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    label: 'Basse'
  },
  'medium': {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'Moyenne'
  },
  'high': {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Haute'
  },
  'urgent': {
    bg: 'bg-rose-500/20',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Urgente'
  }
};

/**
 * Helper function pour obtenir les classes de couleur pour un statut
 * @param {string} status - Le statut
 * @param {string} type - Le type (lead, project, activity)
 * @returns {object} - Les classes CSS
 */
export const getStatusColors = (status, type = 'lead') => {
  const statusMaps = {
    lead: LEAD_STATUS_COLORS,
    project: PROJECT_STATUS_COLORS,
    activity: ACTIVITY_STATUS_COLORS,
    priority: PRIORITY_COLORS
  };

  const statusMap = statusMaps[type];
  return statusMap?.[status] || {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    label: status
  };
};
