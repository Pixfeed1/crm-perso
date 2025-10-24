// src/services/api.js
/**
 * Service central pour les appels API vers le backend
 */

import { getAuthToken, clearAuth, isTokenExpired } from './authService';

// URL de base de l'API
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://crm.pixfeed.net/api'
  : 'http://localhost:5000/api';

/**
 * Fonction générique pour effectuer des requêtes à l'API
 * @param {string} endpoint - Point d'accès de l'API (ex: '/activities')
 * @param {string} method - Méthode HTTP (GET, POST, PUT, DELETE)
 * @param {object} data - Données à envoyer pour POST, PUT, PATCH
 * @returns {Promise} - Promesse contenant la réponse
 */
export const apiRequest = async (endpoint, method = 'GET', data = null) => {
  try {
    // Récupérer le token d'authentification
    const token = getAuthToken();
    console.log('Token utilisé pour la requête:', token);
    
    // Vérifier si le token est expiré
    if (token && isTokenExpired(token)) {
      console.log('Token expiré détecté avant la requête');
      clearAuth();
      window.location.href = '/login?session=expired';
      throw new Error('Session expirée. Redirection vers la page de connexion...');
    }
    
    // Options de la requête
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      credentials: 'include',
    };
    console.log('En-têtes de la requête:', options.headers);
    
    // Ajouter les données pour les requêtes POST, PUT, etc.
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
      console.log('Données envoyées:', JSON.stringify(data, null, 2));
    }
    
    // Effectuer la requête
    console.log(`Envoi de requête ${method} à ${API_BASE_URL}${endpoint}`);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    console.log('Statut de la réponse:', response.status);
    
    // Vérifier si la réponse est OK
    if (!response.ok) {
      // Log détaillé de l'erreur
      console.error('Erreur de réponse:', {
        status: response.status,
        statusText: response.statusText,
        url: response.url
      });
      
      // Capturer le texte complet de la réponse pour le debug
      const responseText = await response.text();
      console.error('Réponse complète du serveur:', responseText);
      
      // Gestion spéciale des erreurs d'authentification (401)
      if (response.status === 401) {
        try {
          const errorData = JSON.parse(responseText);
          
          // Si le message d'erreur indique un token expiré
          if (errorData.message && (
              errorData.message.includes('expiré') || 
              errorData.message.includes('expired') || 
              errorData.message.includes('token')
          )) {
            console.log('Token expiré détecté, redirection vers la page de login');
            clearAuth();
            window.location.href = '/login?session=expired';
            throw new Error('Session expirée. Redirection vers la page de connexion...');
          }
        } catch (parseError) {
          // En cas d'erreur de parsing, on continue avec l'erreur originale
        }
      }
      
      try {
        const errorData = JSON.parse(responseText);
        throw new Error(errorData.message || `Erreur ${response.status}`);
      } catch (parseError) {
        throw new Error(`Erreur ${response.status}: ${responseText}`);
      }
    }
    
    // Pour les suppressions réussies qui pourraient ne pas renvoyer de contenu
    if (method === 'DELETE' && response.status === 204) {
      console.log('Suppression réussie, statut 204 sans contenu');
      return { success: true };
    }
    
    // Obtenir et logger les données de réponse
    const responseData = await response.json();
    console.log('Données reçues:', responseData);
    return responseData;
  } catch (error) {
    console.error(`Erreur API (${endpoint}):`, error);
    throw error;
  }
};

// ===== ACTIVITÉS =====
export const activitiesAPI = {
  getAll: () => {
    console.log('Appel API: récupération de toutes les activités');
    return apiRequest('/activities');
  },
  getById: (id) => {
    console.log(`Appel API: récupération de l'activité ID ${id}`);
    return apiRequest(`/activities/${id}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'une nouvelle activité', data);
    return apiRequest('/activities', 'POST', data);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour de l'activité ID ${id}`, data);
    return apiRequest(`/activities/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression de l'activité ID ${id}`);
    return apiRequest(`/activities/${id}`, 'DELETE');
  },
  complete: (id, actualTime) => {
    console.log(`Appel API: complétion de l'activité ID ${id} avec temps réel ${actualTime}`);
    return apiRequest(`/activities/${id}/complete`, 'PATCH', { actual_time: actualTime });
  }
};

// ===== PROJETS =====
export const projectsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les projets');
    return apiRequest('/projects');
  },
  getById: (id) => {
    console.log(`Appel API: récupération du projet ID ${id}`);
    return apiRequest(`/projects/${id}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'un nouveau projet', data);
    return apiRequest('/projects', 'POST', data);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour du projet ID ${id}`, data);
    return apiRequest(`/projects/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression du projet ID ${id}`);
    return apiRequest(`/projects/${id}`, 'DELETE');
  }
};

// ===== LEADS =====
export const leadsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les leads');
    return apiRequest('/leads');
  },
  getById: (id) => {
    console.log(`Appel API: récupération du lead ID ${id}`);
    return apiRequest(`/leads/${id}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'un nouveau lead', data);
    return apiRequest('/leads', 'POST', data);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour du lead ID ${id}`, data);
    return apiRequest(`/leads/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression du lead ID ${id}`);
    return apiRequest(`/leads/${id}`, 'DELETE');
  },
  getContacts: (leadId) => {
    console.log(`Appel API: récupération des contacts du lead ID ${leadId}`);
    return apiRequest(`/leads/${leadId}/contacts`);
  },
  addContact: (leadId, data) => {
    console.log(`Appel API: ajout d'un contact au lead ID ${leadId}`, data);
    return apiRequest(`/leads/${leadId}/contacts`, 'POST', data);
  },
  updateContact: (leadId, contactId, data) => {
    console.log(`Appel API: mise à jour du contact ID ${contactId} du lead ID ${leadId}`, data);
    return apiRequest(`/leads/${leadId}/contacts/${contactId}`, 'PUT', data);
  },
  deleteContact: (leadId, contactId) => {
    console.log(`Appel API: suppression du contact ID ${contactId} du lead ID ${leadId}`);
    return apiRequest(`/leads/${leadId}/contacts/${contactId}`, 'DELETE');
  }
};

// ===== ÉVÉNEMENTS =====
export const eventsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les événements');
    return apiRequest('/events');
  },
  getById: (id) => {
    console.log(`Appel API: récupération de l'événement ID ${id}`);
    return apiRequest(`/events/${id}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'un nouvel événement', data);
    return apiRequest('/events', 'POST', data);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour de l'événement ID ${id}`, data);
    return apiRequest(`/events/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression de l'événement ID ${id}`);
    return apiRequest(`/events/${id}`, 'DELETE');
  }
};

// ===== OBJECTIFS =====
export const goalsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les objectifs');
    return apiRequest('/goals');
  },
  getById: (id) => {
    console.log(`Appel API: récupération de l'objectif ID ${id}`);
    return apiRequest(`/goals/${id}`);
  },
  create: (data) => {
    // Créer une copie pour éviter de modifier l'objet original
    const apiData = { 
      name: data.name || data.title || data.nom || '',
      description: data.description || '',
      target_value: data.target_value || 0,
      current_value: data.current_value || 0,
      category: data.category || data.categorie || '',
      period: data.period || data.periode || '',
      start_date: data.start_date || '',
      end_date: data.end_date || ''
    };
    
    // Logging détaillé pour debugging
    console.log('Appel API: création d\'un nouvel objectif', JSON.stringify(apiData, null, 2));
    
    // Vérification de tous les champs obligatoires
    const requiredFields = ['name', 'target_value', 'category', 'period', 'start_date', 'end_date'];
    const missingFields = requiredFields.filter(field => !apiData[field]);
    
    if (missingFields.length > 0) {
      console.error('ATTENTION: Champs obligatoires manquants:', missingFields);
      console.error('Données de l\'objectif:', apiData);
    }
    
    return apiRequest('/goals', 'POST', apiData);
  },
  update: (id, data) => {
    // Pour mise à jour de la progression uniquement
    if (Object.keys(data).length === 1 && 'current_value' in data) {
      console.log(`Appel API: mise à jour de la progression de l'objectif ID ${id} à ${data.current_value}`);
      return apiRequest(`/goals/${id}/progress`, 'PATCH', { current_value: data.current_value });
    }
    
    // Pour les autres mises à jour, construire un objet avec seulement les champs définis
    const apiData = {};
    
    if (data.name || data.title || data.nom) apiData.name = data.name || data.title || data.nom;
    if (data.description !== undefined) apiData.description = data.description;
    if (data.target_value !== undefined) apiData.target_value = data.target_value;
    if (data.current_value !== undefined) apiData.current_value = data.current_value;
    if (data.category || data.categorie) apiData.category = data.category || data.categorie;
    if (data.period || data.periode) apiData.period = data.period || data.periode;
    if (data.start_date) apiData.start_date = data.start_date;
    if (data.end_date) apiData.end_date = data.end_date;
    
    // Logging détaillé pour debugging
    console.log(`Appel API: mise à jour de l'objectif ID ${id}`, JSON.stringify(apiData, null, 2));
    
    // Vérification qu'il y a des données à mettre à jour
    if (Object.keys(apiData).length === 0) {
      console.error('ATTENTION: Aucune donnée valide à mettre à jour');
      throw new Error('Aucun champ valide à mettre à jour');
    }
    
    return apiRequest(`/goals/${id}`, 'PUT', apiData);
  },
  updateProgress: (id, currentValue) => {
    console.log(`Appel API: mise à jour de la progression pour l'objectif ${id} à ${currentValue}`);
    return apiRequest(`/goals/${id}/progress`, 'PATCH', { current_value: currentValue });
  },
  delete: (id) => {
    console.log(`Appel API: suppression de l'objectif ID ${id}`);
    return apiRequest(`/goals/${id}`, 'DELETE');
  },
  getMilestones: (goalId) => {
    console.log(`Appel API: récupération des jalons de l'objectif ID ${goalId}`);
    return apiRequest(`/goals/${goalId}/milestones`);
  },
  addMilestone: (goalId, data) => {
    console.log(`Appel API: ajout d'un jalon à l'objectif ID ${goalId}`, data);
    return apiRequest(`/goals/${goalId}/milestones`, 'POST', data);
  },
  updateMilestone: (goalId, milestoneId, data) => {
    console.log(`Appel API: mise à jour du jalon ID ${milestoneId} de l'objectif ID ${goalId}`, data);
    return apiRequest(`/goals/${goalId}/milestones/${milestoneId}`, 'PUT', data);
  },
  deleteMilestone: (goalId, milestoneId) => {
    console.log(`Appel API: suppression du jalon ID ${milestoneId} de l'objectif ID ${goalId}`);
    return apiRequest(`/goals/${goalId}/milestones/${milestoneId}`, 'DELETE');
  }
};

// ===== REVENUS =====
export const revenuesAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les revenus');
    return apiRequest('/revenues');
  },
  getById: (id) => {
    console.log(`Appel API: récupération du revenu ID ${id}`);
    return apiRequest(`/revenues/${id}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'un nouveau revenu', data);
    return apiRequest('/revenues', 'POST', data);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour du revenu ID ${id}`, data);
    return apiRequest(`/revenues/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression du revenu ID ${id}`);
    return apiRequest(`/revenues/${id}`, 'DELETE');
  }
};

// ===== TABLEAU DE BORD =====
export const dashboardAPI = {
  getData: () => {
    console.log('Appel API: récupération des données du tableau de bord');
    return apiRequest('/dashboard');
  }
};