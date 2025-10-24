// backend/constants.js

/**
 * Constantes pour l'application CRM
 * Centralise toutes les valeurs d'énumération pour garantir la cohérence
 */

const CONSTANTS = {
  // Statuts d'activité
  ACTIVITY_STATUS: {
    PLANNED: 'planned',     // Activité prévue mais pas encore commencée
    IN_PROGRESS: 'in-progress', // Activité en cours
    PENDING: 'pending',     // En attente d'une action externe
    COMPLETED: 'completed'  // Activité terminée
  },
  
  // Priorités d'activité
  ACTIVITY_PRIORITY: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
  },
  
  // Types de leads
  LEAD_TYPE: {
    COMPANY: 'company',
    INDIVIDUAL: 'individual'
  },
  
  // Statuts de projet
  PROJECT_STATUS: {
    DRAFT: 'draft',
    ACTIVE: 'active',
    ON_HOLD: 'on-hold',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },
  
  // Fonctions utilitaires pour les contraintes SQL
  getSQLEnumConstraint: function(enumObj) {
    return Object.values(enumObj).map(value => `'${value}'`).join(', ');
  }
};

// Vérification de l'intégrité des constantes (pour éviter les doublons ou valeurs invalides)
function validateConstants() {
  // Vérifier les doublons dans les valeurs d'énumération
  const allValues = [];
  let hasError = false;
  
  Object.entries(CONSTANTS).forEach(([key, value]) => {
    if (typeof value === 'object' && !Array.isArray(value)) {
      const enumValues = Object.values(value);
      const uniqueValues = new Set(enumValues);
      
      if (enumValues.length !== uniqueValues.size) {
        console.error(`ERREUR: Valeurs en double détectées dans ${key}`);
        hasError = true;
      }
      
      // Vérifier les caractères invalides pour SQL
      enumValues.forEach(val => {
        if (typeof val === 'string' && (val.includes("'") || val.includes('"'))) {
          console.error(`ERREUR: Caractère invalide dans ${key}.${val}`);
          hasError = true;
        }
      });
    }
  });
  
  if (hasError) {
    throw new Error('Validation des constantes échouée. Voir les erreurs ci-dessus.');
  }
  
  console.log('Validation des constantes réussie');
}

// Valider les constantes au chargement
validateConstants();

module.exports = CONSTANTS;