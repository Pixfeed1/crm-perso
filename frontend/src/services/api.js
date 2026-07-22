// src/services/api.js
/**
 * Service central pour les appels API vers le backend
 */

import { getAuthToken, clearAuth, isTokenExpired } from './authService';

// URL de base de l'API
export const API_BASE_URL = process.env.NODE_ENV === 'production'
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

/**
 * Requête GET authentifiée renvoyant la réponse brute (pour blob/texte :
 * PDF, aperçu HTML). Attache le token comme apiRequest, mais ne fait pas .json().
 */
export const apiRequestRaw = async (endpoint) => {
  const token = getAuthToken();

  if (token && isTokenExpired(token)) {
    clearAuth();
    window.location.href = '/login?session=expired';
    throw new Error('Session expirée. Redirection vers la page de connexion...');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur ${response.status}: ${text}`);
  }

  return response;
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
  },
  // Paiements
  getPayments: (projectId) => {
    console.log(`Appel API: récupération des paiements du projet ID ${projectId}`);
    return apiRequest(`/projects/${projectId}/payments`);
  },
  getPaymentsTotal: (projectId) => {
    console.log(`Appel API: récupération du total des paiements du projet ID ${projectId}`);
    return apiRequest(`/projects/${projectId}/payments/total`);
  },
  addPayment: (projectId, data) => {
    console.log(`Appel API: ajout d'un paiement au projet ID ${projectId}`, data);
    return apiRequest(`/projects/${projectId}/payments`, 'POST', data);
  },
  updatePayment: (projectId, paymentId, data) => {
    console.log(`Appel API: mise à jour du paiement ID ${paymentId} du projet ID ${projectId}`, data);
    return apiRequest(`/projects/${projectId}/payments/${paymentId}`, 'PUT', data);
  },
  deletePayment: (projectId, paymentId) => {
    console.log(`Appel API: suppression du paiement ID ${paymentId} du projet ID ${projectId}`);
    return apiRequest(`/projects/${projectId}/payments/${paymentId}`, 'DELETE');
  },
  // Tâches
  getTasks: (projectId) => {
    console.log(`Appel API: récupération des tâches du projet ID ${projectId}`);
    return apiRequest(`/projects/${projectId}/tasks`);
  },
  addTask: (projectId, data) => {
    console.log(`Appel API: ajout d'une tâche au projet ID ${projectId}`, data);
    return apiRequest(`/projects/${projectId}/tasks`, 'POST', data);
  },
  updateTask: (projectId, taskId, data) => {
    console.log(`Appel API: mise à jour de la tâche ID ${taskId} du projet ID ${projectId}`, data);
    return apiRequest(`/projects/${projectId}/tasks/${taskId}`, 'PUT', data);
  },
  deleteTask: (projectId, taskId) => {
    console.log(`Appel API: suppression de la tâche ID ${taskId} du projet ID ${projectId}`);
    return apiRequest(`/projects/${projectId}/tasks/${taskId}`, 'DELETE');
  }
};

// ===== LEADS =====
export const leadsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les leads');
    return apiRequest('/leads');
  },
  // Envoi immédiat d'un email depuis une fiche prospect (+ log Suivi côté serveur)
  sendEmail: (id, payload) => apiRequest(`/leads/${id}/send-email`, 'POST', payload),
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
  import: (leads) => {
    console.log('Appel API: import de leads', leads);
    return apiRequest('/leads/import', 'POST', { leads });
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
  },
  // Liaison contact-client
  createClientFromContact: (leadId, contactId, data) => {
    console.log(`Appel API: création d'un client depuis le contact ID ${contactId} du lead ID ${leadId}`, data);
    return apiRequest(`/leads/${leadId}/contacts/${contactId}/create-client`, 'POST', data);
  },
  linkContactToClient: (leadId, contactId, clientId) => {
    console.log(`Appel API: liaison du contact ID ${contactId} au client ID ${clientId}`);
    return apiRequest(`/leads/${leadId}/contacts/${contactId}/link-client`, 'POST', { clientId });
  },
  unlinkContactFromClient: (leadId, contactId) => {
    console.log(`Appel API: déliaison du contact ID ${contactId} de son client`);
    return apiRequest(`/leads/${leadId}/contacts/${contactId}/unlink-client`, 'DELETE');
  },
  // Interactions
  getInteractions: (leadId) => {
    console.log(`Appel API: récupération des interactions du lead ID ${leadId}`);
    return apiRequest(`/leads/${leadId}/interactions`);
  },
  addInteraction: (leadId, data) => {
    console.log(`Appel API: ajout d'une interaction au lead ID ${leadId}`, data);
    return apiRequest(`/leads/${leadId}/interactions`, 'POST', data);
  },
  updateInteraction: (interactionId, data) => {
    console.log(`Appel API: mise à jour de l'interaction ID ${interactionId}`, data);
    return apiRequest(`/leads/interactions/${interactionId}`, 'PUT', data);
  },
  deleteInteraction: (interactionId) => {
    console.log(`Appel API: suppression de l'interaction ID ${interactionId}`);
    return apiRequest(`/leads/interactions/${interactionId}`, 'DELETE');
  },
  // Kanban
  getKanbanStats: () => {
    console.log('Appel API: récupération des statistiques Kanban');
    return apiRequest('/leads/kanban/stats');
  }
};

// ===== CLIENTS =====
export const clientsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les clients');
    return apiRequest('/clients');
  },
  getById: (id) => {
    console.log(`Appel API: récupération du client ID ${id}`);
    return apiRequest(`/clients/${id}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'un nouveau client', data);
    return apiRequest('/clients', 'POST', data);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour du client ID ${id}`, data);
    return apiRequest(`/clients/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression du client ID ${id}`);
    return apiRequest(`/clients/${id}`, 'DELETE');
  },
  import: (clients) => {
    console.log('Appel API: import de clients', clients);
    return apiRequest('/clients/import', 'POST', { clients });
  },
  convertFromLead: (leadId, data = {}) => {
    console.log(`Appel API: conversion du lead ID ${leadId} en client`, data);
    return apiRequest(`/clients/convert/${leadId}`, 'POST', data);
  },
  getStats: () => {
    console.log('Appel API: récupération des statistiques des clients');
    return apiRequest('/clients/stats');
  },
  // Envoyer un email générique (sans client)
  sendGenericEmail: (data) => {
    console.log('Appel API: envoi email générique', data);
    return apiRequest('/clients/send-email', 'POST', data);
  }
};

// ===== ÉVÉNEMENTS =====
export const eventsAPI = {
  getAll: (params = {}) => {
    console.log('Appel API: récupération de tous les événements', params);
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/events${queryString ? `?${queryString}` : ''}`);
  },
  getById: (id) => {
    console.log(`Appel API: récupération de l'événement ID ${id}`);
    return apiRequest(`/events/${id}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'un nouvel événement', data);
    return apiRequest('/events', 'POST', data);
  },
  createRecurring: (data) => {
    console.log('Appel API: création d\'un événement récurrent', data);
    return apiRequest('/events/recurring', 'POST', data);
  },
  importEvents: (payload) => {
    console.log('Appel API: import d\'événements (JSON)', payload);
    return apiRequest('/events/import', 'POST', payload);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour de l'événement ID ${id}`, data);
    return apiRequest(`/events/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression de l'événement ID ${id}`);
    return apiRequest(`/events/${id}`, 'DELETE');
  },
  // Routes pour les événements récurrents
  getOccurrences: (id, startDate, endDate) => {
    console.log(`Appel API: récupération des occurrences de l'événement ID ${id}`);
    return apiRequest(`/events/${id}/occurrences?start_date=${startDate}&end_date=${endDate}`);
  },
  addException: (id, exceptionDate) => {
    console.log(`Appel API: ajout d'une exception à l'événement ID ${id}`);
    return apiRequest(`/events/${id}/exceptions`, 'POST', { exception_date: exceptionDate });
  },
  removeException: (id, exceptionDate) => {
    console.log(`Appel API: suppression d'une exception de l'événement ID ${id}`);
    return apiRequest(`/events/${id}/exceptions`, 'DELETE', { exception_date: exceptionDate });
  },
  modifyOccurrence: (id, exceptionDate, modifiedData) => {
    console.log(`Appel API: modification d'une occurrence de l'événement ID ${id}`);
    return apiRequest(`/events/${id}/modify-occurrence`, 'POST', {
      exception_date: exceptionDate,
      ...modifiedData
    });
  },
  getExceptions: (id) => {
    console.log(`Appel API: récupération des exceptions de l'événement ID ${id}`);
    return apiRequest(`/events/${id}/exceptions`);
  },
  getModifiedOccurrences: (id) => {
    console.log(`Appel API: récupération des occurrences modifiées de l'événement ID ${id}`);
    return apiRequest(`/events/${id}/modified-occurrences`);
  },
  checkConflicts: (eventData) => {
    console.log('Appel API: vérification des conflits', eventData);
    return apiRequest('/events/check-conflicts', 'POST', eventData);
  },
  suggestSlots: (eventData, options = {}) => {
    console.log('Appel API: suggestion de créneaux alternatifs', eventData, options);
    return apiRequest('/events/suggest-slots', 'POST', { eventData, options });
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
  },
  // Archivage
  getArchived: () => {
    console.log('Appel API: récupération des objectifs archivés');
    return apiRequest('/goals/archived/list');
  },
  archive: (id) => {
    console.log(`Appel API: archivage de l'objectif ID ${id}`);
    return apiRequest(`/goals/${id}/archive`, 'PATCH');
  },
  unarchive: (id) => {
    console.log(`Appel API: désarchivage de l'objectif ID ${id}`);
    return apiRequest(`/goals/${id}/unarchive`, 'PATCH');
  },
  complete: (id) => {
    console.log(`Appel API: marquer l'objectif ID ${id} comme terminé`);
    return apiRequest(`/goals/${id}/complete`, 'PATCH');
  },
  duplicate: (id, newDates = {}) => {
    console.log(`Appel API: duplication de l'objectif ID ${id}`, newDates);
    return apiRequest(`/goals/${id}/duplicate`, 'POST', newDates);
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

// ===== SEO (lecture seule : données produites par le worker Python seo_worker) =====
export const seoAPI = {
  getSites: () => apiRequest('/seo/sites'),
  getOverview: (siteId) => apiRequest(`/seo/overview?site_id=${siteId}`),
  getPages: (siteId, params = {}) => {
    const qs = new URLSearchParams({ site_id: siteId, ...params }).toString();
    return apiRequest(`/seo/pages?${qs}`);
  },
  getGraph: (siteId) => apiRequest(`/seo/graph?site_id=${siteId}`),
  getAffamees: (siteId) => apiRequest(`/seo/affamees?site_id=${siteId}`),
  getGscStatus: () => apiRequest('/seo/gsc/status'),
  getQuasiVictoires: (siteId) => apiRequest(`/seo/quasi-victoires?site_id=${siteId}`),
  getCannibalisation: (siteId, days = 28) => apiRequest(`/seo/cannibalisation?site_id=${siteId}&days=${days}`),
  getCtrAnomalies: (siteId, days = 28) => apiRequest(`/seo/ctr-anomalies?site_id=${siteId}&days=${days}`),
  getOpportunites: (siteId, minImpr = 20) => apiRequest(`/seo/opportunites?site_id=${siteId}&min_impressions=${minImpr}`),
  getAudit: (siteId) => apiRequest(`/seo/audit?site_id=${siteId}`),
  // Suivi de positions (rank tracker)
  getPositionsSummary: (siteId, days = 28) => apiRequest(`/seo/positions/summary?site_id=${siteId}&days=${days}`),
  getPositionsKeywords: (siteId, params = {}) => {
    const qs = new URLSearchParams({ site_id: siteId, ...params }).toString();
    return apiRequest(`/seo/positions/keywords?${qs}`);
  },
  getPositionKeywordSeries: (siteId, keyword, days = 28) =>
    apiRequest(`/seo/positions/keyword?site_id=${siteId}&keyword=${encodeURIComponent(keyword)}&days=${days}`),
  getPositionsPages: (siteId, days = 28) => apiRequest(`/seo/positions/pages?site_id=${siteId}&days=${days}`),
  getPositionsPage: (siteId, url, days = 28) =>
    apiRequest(`/seo/positions/page?site_id=${siteId}&url=${encodeURIComponent(url)}&days=${days}`),
  getPositionsYoast: (siteId, days = 28) => apiRequest(`/seo/positions/yoast?site_id=${siteId}&days=${days}`),
  getTrackedKeywords: (siteId) => apiRequest(`/seo/tracked?site_id=${siteId}`),
  addTrackedKeyword: (siteId, keyword) => apiRequest('/seo/tracked', 'POST', { site_id: siteId, keyword }),
  deleteTrackedKeyword: (id) => apiRequest(`/seo/tracked/${id}`, 'DELETE'),
  createJob: (siteId, jobType, targetUrl) => apiRequest('/seo/jobs', 'POST', { site_id: siteId, job_type: jobType, target_url: targetUrl }),
  getJob: (siteId) => apiRequest(`/seo/jobs?site_id=${siteId}`),
  getJobById: (jobId) => apiRequest(`/seo/jobs/${jobId}`),
  cancelJob: (jobId) => apiRequest(`/seo/jobs/${jobId}/cancel`, 'POST')
};

// ===== VEILLE MISSIONS (agent annonces freelance) =====
export const veilleAPI = {
  getAnnonces: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/veille/annonces${qs ? `?${qs}` : ''}`);
  },
  ecarter: (id) => apiRequest(`/veille/annonces/${id}/ecarter`, 'POST'),
  reactiver: (id) => apiRequest(`/veille/annonces/${id}/reactiver`, 'POST'),
  getCriteres: () => apiRequest('/veille/criteres'),
  updateCriteres: (data) => apiRequest('/veille/criteres', 'PUT', data),
  run: () => apiRequest('/veille/run', 'POST'),
  runStatus: () => apiRequest('/veille/run/status')
};

// ===== PILOTAGE CA / MRR (module Objectif) =====
export const objectifAPI = {
  getSummary: (annee = 2027) => apiRequest(`/objectif/summary?annee=${annee}`),
  getParams: (annee = 2027) => apiRequest(`/objectif/params?annee=${annee}`),
  updateParams: (data) => apiRequest('/objectif/params', 'PUT', data)
};

// ===== TABLEAU DE BORD =====
export const dashboardAPI = {
  getData: () => {
    console.log('Appel API: récupération des données du tableau de bord');
    return apiRequest('/dashboard');
  }
};

// ===== RAPPELS =====
export const remindersAPI = {
  // Récupération
  getActive: () => {
    console.log('Appel API: récupération des rappels actifs');
    return apiRequest('/reminders/active');
  },
  getOverdue: () => {
    console.log('Appel API: récupération des rappels en retard');
    return apiRequest('/reminders/overdue');
  },
  getUpcoming: (days = 7) => {
    console.log(`Appel API: récupération des rappels à venir (${days} jours)`);
    return apiRequest(`/reminders/upcoming?days=${days}`);
  },
  getByEntity: (entityType, entityId) => {
    console.log(`Appel API: récupération des rappels pour ${entityType} ID ${entityId}`);
    return apiRequest(`/reminders/entity/${entityType}/${entityId}`);
  },
  getById: (id) => {
    console.log(`Appel API: récupération du rappel ID ${id}`);
    return apiRequest(`/reminders/${id}`);
  },
  getCount: () => {
    console.log('Appel API: récupération du nombre de rappels');
    return apiRequest('/reminders/count');
  },

  // Création
  create: (data) => {
    console.log('Appel API: création d\'un nouveau rappel', data);
    return apiRequest('/reminders', 'POST', data);
  },

  // Mise à jour
  update: (id, data) => {
    console.log(`Appel API: mise à jour du rappel ID ${id}`, data);
    return apiRequest(`/reminders/${id}`, 'PUT', data);
  },
  complete: (id) => {
    console.log(`Appel API: marquage du rappel ID ${id} comme complété`);
    return apiRequest(`/reminders/${id}/complete`, 'PATCH');
  },
  dismiss: (id) => {
    console.log(`Appel API: rejet du rappel ID ${id}`);
    return apiRequest(`/reminders/${id}/dismiss`, 'PATCH');
  },

  // Suppression
  delete: (id) => {
    console.log(`Appel API: suppression du rappel ID ${id}`);
    return apiRequest(`/reminders/${id}`, 'DELETE');
  },

  // Configuration (relances factures)
  getSettings: () => {
    console.log('Appel API: récupération paramètres relances');
    return apiRequest('/reminders/settings');
  },
  updateSettings: (data) => {
    console.log('Appel API: mise à jour paramètres relances', data);
    return apiRequest('/reminders/settings', 'PUT', data);
  },

  // Détection et envoi
  detectInvoices: () => {
    console.log('Appel API: détection factures nécessitant relance');
    return apiRequest('/reminders/detect');
  },
  sendReminder: (invoiceId, reminderLevel) => {
    console.log(`Appel API: envoi relance pour facture ID ${invoiceId}, niveau ${reminderLevel}`);
    return apiRequest(`/reminders/send/${invoiceId}`, 'POST', { reminder_level: reminderLevel });
  },
  sendBatch: () => {
    console.log('Appel API: envoi relances en batch');
    return apiRequest('/reminders/send-batch', 'POST');
  },

  // Historique et statistiques
  getStats: () => {
    console.log('Appel API: récupération statistiques relances');
    return apiRequest('/reminders/stats');
  },
  getHistory: (limit = 50, offset = 0) => {
    console.log('Appel API: récupération historique relances', { limit, offset });
    const params = new URLSearchParams();
    params.append('limit', limit);
    params.append('offset', offset);
    return apiRequest(`/reminders/history?${params}`);
  },
  getByInvoice: (invoiceId) => {
    console.log(`Appel API: récupération historique relances pour facture ID ${invoiceId}`);
    return apiRequest(`/reminders/invoice/${invoiceId}`);
  },
  deleteByInvoice: (invoiceId) => {
    console.log(`Appel API: suppression historique relances pour facture ID ${invoiceId}`);
    return apiRequest(`/reminders/invoice/${invoiceId}`, 'DELETE');
  }
};

// ===== RECHERCHE =====
export const searchAPI = {
  global: (query) => {
    console.log(`Appel API: recherche globale pour "${query}"`);
    return apiRequest(`/search?query=${encodeURIComponent(query)}`);
  }
};

// ===== EXPORTS =====
export const exportAPI = {
  // Fonction utilitaire pour déclencher le téléchargement d'un fichier
  downloadFile: (url, filename) => {
    console.log(`Téléchargement de ${filename} depuis ${url}`);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Export des leads en CSV
  leads: () => {
    console.log('Appel API: export des leads en CSV');
    const url = `${API_BASE_URL}/export/leads`;
    window.open(url, '_blank');
  },

  // Export des projets en CSV
  projects: () => {
    console.log('Appel API: export des projets en CSV');
    const url = `${API_BASE_URL}/export/projects`;
    window.open(url, '_blank');
  },

  // Export des objectifs en CSV
  goals: () => {
    console.log('Appel API: export des objectifs en CSV');
    const url = `${API_BASE_URL}/export/goals`;
    window.open(url, '_blank');
  },

  // Export des revenus en CSV
  revenues: () => {
    console.log('Appel API: export des revenus en CSV');
    const url = `${API_BASE_URL}/export/revenues`;
    window.open(url, '_blank');
  },

  // Export des activités en CSV
  activities: () => {
    console.log('Appel API: export des activités en CSV');
    const url = `${API_BASE_URL}/export/activities`;
    window.open(url, '_blank');
  },

  // Export des contacts en CSV
  contacts: () => {
    console.log('Appel API: export des contacts en CSV');
    const url = `${API_BASE_URL}/export/contacts`;
    window.open(url, '_blank');
  },

  // Export des clients en CSV
  clients: () => {
    console.log('Appel API: export des clients en CSV');
    const url = `${API_BASE_URL}/export/clients`;
    window.open(url, '_blank');
  },

  // Export complet (toutes les données en JSON)
  all: async () => {
    console.log('Appel API: export complet de toutes les données');
    return apiRequest('/export/all');
  }
};

// ===== RÉGIMES TVA =====
export const tvaRegimesAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les régimes TVA');
    return apiRequest('/tva-regimes');
  },
  getByCode: (code) => {
    console.log(`Appel API: récupération du régime TVA avec code ${code}`);
    return apiRequest(`/tva-regimes/${code}`);
  }
};

// ===== MOYENS DE PAIEMENT =====
export const paymentMethodsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les moyens de paiement');
    return apiRequest('/payment-methods');
  },
  getByCode: (code) => {
    console.log(`Appel API: récupération du moyen de paiement avec code ${code}`);
    return apiRequest(`/payment-methods/${code}`);
  }
};

// ===== PROSPECTION (France Travail, etc.) =====
export const prospectionAPI = {
  // Test de connexion à France Travail
  testConnection: () => {
    console.log('Appel API: test connexion France Travail');
    return apiRequest('/prospection/test/pole-emploi');
  },

  // Recherche multi-sources
  search: (keywords, location = '', sources = 'pole-emploi', filters = {}) => {
    console.log(`Appel API: recherche prospection "${keywords}" (${location || 'France'})`);
    const params = new URLSearchParams({
      keywords,
      ...(location && { location }),
      sources
    });

    // Ajouter les filtres avancés si présents
    if (filters.contractType) params.append('contractType', filters.contractType);
    if (filters.experience) params.append('experience', filters.experience);
    if (filters.datePosted) params.append('datePosted', filters.datePosted);
    if (filters.minSalary) params.append('minSalary', filters.minSalary);
    if (filters.maxSalary) params.append('maxSalary', filters.maxSalary);

    return apiRequest(`/prospection/search?${params}`);
  },

  // Recherche France Travail uniquement
  searchFranceTravail: (keywords, options = {}) => {
    console.log(`Appel API: recherche France Travail "${keywords}"`);
    const params = new URLSearchParams({
      keywords,
      ...options
    });
    return apiRequest(`/prospection/pole-emploi/search?${params}`);
  },

  // Détails d'une offre France Travail
  getOfferDetails: (offerId) => {
    console.log(`Appel API: détails offre France Travail ${offerId}`);
    return apiRequest(`/prospection/pole-emploi/offer/${offerId}`);
  },

  // Importer une opportunité comme lead
  importLead: (opportunity) => {
    console.log(`Appel API: import opportunité comme lead`);
    return apiRequest('/prospection/import-lead', {
      method: 'POST',
      body: JSON.stringify({ opportunity })
    });
  },

  // Test de connexion SIRENE (INSEE)
  testSirene: () => {
    console.log('Appel API: test connexion SIRENE');
    return apiRequest('/prospection/test/sirene');
  },

  // Recherche d'entreprises via SIRENE
  searchSirene: (criteria) => {
    console.log('Appel API: recherche SIRENE', criteria);
    const params = new URLSearchParams();

    if (criteria.nafCode) params.append('nafCode', criteria.nafCode);
    if (criteria.city) params.append('city', criteria.city);
    if (criteria.postalCode) params.append('postalCode', criteria.postalCode);
    if (criteria.department) params.append('department', criteria.department);
    if (criteria.region) params.append('region', criteria.region);
    if (criteria.companyName) params.append('companyName', criteria.companyName);
    if (criteria.minEmployees) params.append('minEmployees', criteria.minEmployees);
    if (criteria.maxEmployees) params.append('maxEmployees', criteria.maxEmployees);
    if (criteria.limit) params.append('limit', criteria.limit);

    return apiRequest(`/prospection/sirene/search?${params}`);
  },

  // Test de connexion Pappers
  testPappers: () => {
    console.log('Appel API: test connexion Pappers');
    return apiRequest('/prospection/test/pappers');
  },

  // Obtenir le statut des crédits Pappers
  getPappersCredits: () => {
    console.log('Appel API: récupération crédits Pappers');
    return apiRequest('/prospection/pappers/credits');
  },

  // Enrichir une entreprise avec Pappers
  enrichWithPappers: (siren) => {
    console.log(`Appel API: enrichissement Pappers SIREN ${siren}`);
    return apiRequest('/prospection/pappers/enrich', {
      method: 'POST',
      body: JSON.stringify({ siren })
    });
  },

  // Enrichir plusieurs entreprises avec Pappers
  enrichMultipleWithPappers: (sirens, maxEnrich = 10) => {
    console.log(`Appel API: enrichissement multiple Pappers (${sirens.length} entreprises)`);
    return apiRequest('/prospection/pappers/enrich-multiple', {
      method: 'POST',
      body: JSON.stringify({ sirens, maxEnrich })
    });
  }
};

// ===== PAIEMENTS =====
export const paymentsAPI = {
  getAll: () => {
    console.log('Appel API: récupération de tous les paiements');
    return apiRequest('/payments');
  },
  getById: (id) => {
    console.log(`Appel API: récupération du paiement ID ${id}`);
    return apiRequest(`/payments/${id}`);
  },
  getByInvoice: (invoiceId) => {
    console.log(`Appel API: récupération des paiements de la facture ID ${invoiceId}`);
    return apiRequest(`/payments/invoice/${invoiceId}`);
  },
  getByClient: (clientId) => {
    console.log(`Appel API: récupération des paiements du client ID ${clientId}`);
    return apiRequest(`/payments/client/${clientId}`);
  },
  create: (data) => {
    console.log('Appel API: création d\'un nouveau paiement', data);
    return apiRequest('/payments', 'POST', data);
  },
  update: (id, data) => {
    console.log(`Appel API: mise à jour du paiement ID ${id}`, data);
    return apiRequest(`/payments/${id}`, 'PUT', data);
  },
  delete: (id) => {
    console.log(`Appel API: suppression du paiement ID ${id}`);
    return apiRequest(`/payments/${id}`, 'DELETE');
  },
  getTreasuryStats: (startDate, endDate) => {
    console.log('Appel API: récupération statistiques trésorerie', { startDate, endDate });
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest(`/payments/stats/treasury?${params}`);
  },
  getChartData: (startDate, endDate) => {
    console.log('Appel API: récupération données graphique trésorerie', { startDate, endDate });
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest(`/payments/stats/chart?${params}`);
  }
};

// ===== DEMANDES D'AVIS =====
export const reviewRequestsAPI = {
  // Envoyer une demande d'avis
  send: (data) => {
    console.log('Appel API: envoi demande d\'avis', data);
    return apiRequest('/review-requests', 'POST', data);
  },

  // Récupérer toutes les demandes d'avis
  getAll: () => {
    console.log('Appel API: récupération de toutes les demandes d\'avis');
    return apiRequest('/review-requests');
  },

  // Récupérer les demandes d'avis d'un client
  getByClient: (clientId) => {
    console.log(`Appel API: récupération des demandes d'avis du client ID ${clientId}`);
    return apiRequest(`/review-requests/client/${clientId}`);
  },

  // Obtenir le template par défaut
  getTemplate: (platforms, clientName, contactName) => {
    console.log('Appel API: récupération du template d\'avis');
    const params = new URLSearchParams();
    if (platforms) params.append('platforms', platforms.join(','));
    if (clientName) params.append('client_name', clientName);
    if (contactName) params.append('contact_name', contactName);
    return apiRequest(`/review-requests/template?${params}`);
  },

  // Obtenir les statistiques
  getStats: () => {
    console.log('Appel API: récupération des statistiques d\'avis');
    return apiRequest('/review-requests/stats');
  }
};

// ===== INTERVENTIONS MAINTENANCE =====
export const interventionsAPI = {
  // Récupérer les interventions d'un projet
  getByProject: (projectId) => {
    console.log(`Appel API: récupération des interventions du projet ${projectId}`);
    return apiRequest(`/interventions/project/${projectId}`);
  },

  // Récupérer les stats d'un projet
  getStats: (projectId) => {
    console.log(`Appel API: récupération des stats interventions du projet ${projectId}`);
    return apiRequest(`/interventions/project/${projectId}/stats`);
  },

  // Créer une intervention
  create: (projectId, data) => {
    console.log(`Appel API: création intervention pour projet ${projectId}`, data);
    return apiRequest(`/interventions/project/${projectId}`, 'POST', data);
  },

  // Récupérer une intervention par ID
  getById: (id) => {
    console.log(`Appel API: récupération intervention ${id}`);
    return apiRequest(`/interventions/${id}`);
  },

  // Mettre à jour une intervention
  update: (id, data) => {
    console.log(`Appel API: mise à jour intervention ${id}`, data);
    return apiRequest(`/interventions/${id}`, 'PUT', data);
  },

  // Supprimer une intervention
  delete: (id) => {
    console.log(`Appel API: suppression intervention ${id}`);
    return apiRequest(`/interventions/${id}`, 'DELETE');
  }
};

// ===== RAPPORTS DE MAINTENANCE =====
export const maintenanceReportsAPI = {
  // Générer un rapport pour un projet
  generate: (projectId, data) => {
    console.log(`Appel API: génération rapport pour projet ${projectId}`, data);
    return apiRequest(`/maintenance-reports/project/${projectId}/generate`, 'POST', data);
  },

  // Générer un rapport pour un contrat de maintenance
  generateForContract: (contractId, data) => {
    console.log(`Appel API: génération rapport pour contrat ${contractId}`, data);
    return apiRequest(`/maintenance-reports/contract/${contractId}/generate`, 'POST', data);
  },

  // Récupérer les rapports d'un projet
  getByProject: (projectId) => {
    console.log(`Appel API: récupération rapports du projet ${projectId}`);
    return apiRequest(`/maintenance-reports/project/${projectId}`);
  },

  // Récupérer les rapports d'un contrat
  getByContract: (contractId) => {
    console.log(`Appel API: récupération rapports du contrat ${contractId}`);
    return apiRequest(`/maintenance-reports/contract/${contractId}`);
  },

  // Récupérer un rapport par ID
  getById: (id) => {
    console.log(`Appel API: récupération rapport ${id}`);
    return apiRequest(`/maintenance-reports/${id}`);
  },

  // Aperçu HTML du rapport (via client authentifié, token attaché)
  getPreviewHtml: async (id) => {
    console.log(`Appel API: aperçu HTML rapport ${id}`);
    const response = await apiRequestRaw(`/maintenance-reports/${id}/preview`);
    return response.text();
  },

  // PDF du rapport en blob (via client authentifié, token attaché)
  getPdfBlob: async (id) => {
    console.log(`Appel API: PDF rapport ${id}`);
    const response = await apiRequestRaw(`/maintenance-reports/${id}/pdf`);
    return response.blob();
  },

  // Mettre à jour un rapport
  update: (id, data) => {
    console.log(`Appel API: mise à jour rapport ${id}`, data);
    return apiRequest(`/maintenance-reports/${id}`, 'PUT', data);
  },

  // Envoyer un rapport
  send: (id, email) => {
    console.log(`Appel API: envoi rapport ${id} à ${email}`);
    return apiRequest(`/maintenance-reports/${id}/send`, 'POST', { email });
  },

  // Supprimer un rapport
  delete: (id) => {
    console.log(`Appel API: suppression rapport ${id}`);
    return apiRequest(`/maintenance-reports/${id}`, 'DELETE');
  }
};

// API pour les contrats de maintenance WordPress
export const maintenanceContractsAPI = {
  // Récupérer tous les contrats
  getAll: () => {
    console.log('Appel API: récupération contrats maintenance');
    return apiRequest('/maintenance-contracts');
  },

  // Récupérer les statistiques
  getStats: () => {
    console.log('Appel API: récupération stats contrats maintenance');
    return apiRequest('/maintenance-contracts/stats');
  },

  // Récupérer un contrat par ID
  getById: (id) => {
    console.log(`Appel API: récupération contrat ${id}`);
    return apiRequest(`/maintenance-contracts/${id}`);
  },

  // Créer un nouveau contrat
  create: (data) => {
    console.log('Appel API: création contrat maintenance', data);
    return apiRequest('/maintenance-contracts', 'POST', data);
  },

  // Mettre à jour un contrat
  update: (id, data) => {
    console.log(`Appel API: mise à jour contrat ${id}`, data);
    return apiRequest(`/maintenance-contracts/${id}`, 'PUT', data);
  },

  // Mettre à jour les scores PageSpeed
  updatePageSpeed: (id, mobile, desktop) => {
    console.log(`Appel API: mise à jour PageSpeed contrat ${id}`, { mobile, desktop });
    return apiRequest(`/maintenance-contracts/${id}/pagespeed`, 'PUT', { mobile, desktop });
  },

  // Supprimer un contrat
  delete: (id) => {
    console.log(`Appel API: suppression contrat ${id}`);
    return apiRequest(`/maintenance-contracts/${id}`, 'DELETE');
  },

  // Créer la session de prélèvement (Stripe Checkout) -> { url }
  createBillingCheckout: (id) => {
    console.log(`Appel API: création checkout prélèvement contrat ${id}`);
    return apiRequest(`/maintenance-contracts/${id}/billing/checkout`, 'POST');
  },

  // Envoyer le lien de prélèvement au client par email (payload: { message, includeConditions, attachments })
  sendBillingLink: (id, payload = {}) => {
    console.log(`Appel API: envoi lien prélèvement contrat ${id}`);
    return apiRequest(`/maintenance-contracts/${id}/billing/send-link`, 'POST', payload);
  },

  // Résilier l'abonnement (immediate=true -> immédiat, sinon fin de période)
  cancelBilling: (id, immediate = false) => {
    console.log(`Appel API: résiliation prélèvement contrat ${id}`, { immediate });
    return apiRequest(`/maintenance-contracts/${id}/billing/cancel`, 'POST', { immediate });
  },

  // Réactiver l'abonnement (annule la résiliation programmée)
  resumeBilling: (id) => {
    console.log(`Appel API: réactivation prélèvement contrat ${id}`);
    return apiRequest(`/maintenance-contracts/${id}/billing/resume`, 'POST');
  }
};

// API pour les abonnements libres (facturation récurrente Stripe)
export const subscriptionsAPI = {
  getAll: () => apiRequest('/subscriptions'),
  create: (data) => apiRequest('/subscriptions', 'POST', data),
  update: (id, data) => apiRequest(`/subscriptions/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/subscriptions/${id}`, 'DELETE'),
  // Aperçu (lecture seule) de l'email + conditions avant envoi -> { recipient, hasEmail, subject, emailHtml, conditionsHtml }
  preview: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/subscriptions/${id}/preview${qs ? `?${qs}` : ''}`);
  },
  // Lien court de paiement (pay.pixfeed.net/{token}) -> { url }
  createBillingCheckout: (id) => apiRequest(`/subscriptions/${id}/billing/checkout`, 'POST'),
  // Envoyer le lien au client par email (payload: { message, includeConditions, attachments })
  sendBillingLink: (id, payload = {}) => apiRequest(`/subscriptions/${id}/billing/send-link`, 'POST', payload),
  // Résilier (immediate=true -> immédiat, sinon fin de période)
  cancelBilling: (id, immediate = false) => apiRequest(`/subscriptions/${id}/billing/cancel`, 'POST', { immediate }),
  // Réactiver
  resumeBilling: (id) => apiRequest(`/subscriptions/${id}/billing/resume`, 'POST')
};

// API pour le suivi des prises de contact (interactions leads + clients)
export const interactionsAPI = {
  getByContact: (contactType, contactId) => apiRequest(`/interactions/contact/${contactType}/${contactId}`),
  create: (data) => apiRequest('/interactions', 'POST', data),
  markFollowupDone: (id, done = true) => apiRequest(`/interactions/${id}/followup-done`, 'PATCH', { done }),
  delete: (id) => apiRequest(`/interactions/${id}`, 'DELETE'),
  getFollowups: () => apiRequest('/interactions/followups'),
  getCockpit: () => apiRequest('/interactions/cockpit'),
  getOutreachSummary: () => apiRequest('/interactions/outreach-summary'),
  setContactStatus: (contact_type, contact_id, relation_status) =>
    apiRequest('/interactions/contact-status', 'PATCH', { contact_type, contact_id, relation_status })
};

// API modèles d'email
export const emailTemplatesAPI = {
  list: () => apiRequest('/email-templates'),
  create: (data) => apiRequest('/email-templates', 'POST', data),
  update: (id, data) => apiRequest(`/email-templates/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/email-templates/${id}`, 'DELETE')
};

// API signatures d'email
export const emailSignaturesAPI = {
  list: () => apiRequest('/email-signatures'),
  create: (data) => apiRequest('/email-signatures', 'POST', data),
  update: (id, data) => apiRequest(`/email-signatures/${id}`, 'PUT', data),
  delete: (id) => apiRequest(`/email-signatures/${id}`, 'DELETE')
};

// API pour le Crawl (outil externe cc_prospector, onglet Portefeuille)
export const crawlAPI = {
  list: () => apiRequest('/portefeuille/crawl'),
  start: (techno, nb_sites) => apiRequest('/portefeuille/crawl', 'POST', { techno, nb_sites }),
  get: (id) => apiRequest(`/portefeuille/crawl/${id}`),
  delete: (id) => apiRequest(`/portefeuille/crawl/${id}`, 'DELETE'),
  toProspect: (id, result_ids, extra = {}) => apiRequest(`/portefeuille/crawl/${id}/to-prospect`, 'POST', { result_ids, ...extra }),
  enrich: (id, result_ids) => apiRequest(`/portefeuille/crawl/${id}/enrich`, 'POST', { result_ids }),
  exportCsv: (id) => apiRequestRaw(`/portefeuille/crawl/${id}/export.csv`)
};

// API pour les emails programmés
export const scheduledEmailsAPI = {
  // Récupérer tous les emails programmés
  getAll: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.email_type) params.append('email_type', filters.email_type);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    const query = params.toString() ? `?${params.toString()}` : '';
    console.log('Appel API: récupération emails programmés');
    return apiRequest(`/scheduled-emails${query}`);
  },

  // Récupérer les statistiques
  getStats: () => {
    console.log('Appel API: récupération stats emails programmés');
    return apiRequest('/scheduled-emails/stats');
  },

  // Récupérer les prochains emails
  getUpcoming: (limit = 10) => {
    console.log('Appel API: récupération prochains emails programmés');
    return apiRequest(`/scheduled-emails/upcoming?limit=${limit}`);
  },

  // Récupérer un email par ID
  getById: (id) => {
    console.log(`Appel API: récupération email programmé ${id}`);
    return apiRequest(`/scheduled-emails/${id}`);
  },

  // Programmer un nouvel email
  create: (data) => {
    console.log('Appel API: création email programmé', data);
    return apiRequest('/scheduled-emails', 'POST', data);
  },

  // Mettre à jour un email programmé
  update: (id, data) => {
    console.log(`Appel API: mise à jour email programmé ${id}`, data);
    return apiRequest(`/scheduled-emails/${id}`, 'PUT', data);
  },

  // Annuler un email programmé
  cancel: (id) => {
    console.log(`Appel API: annulation email programmé ${id}`);
    return apiRequest(`/scheduled-emails/${id}/cancel`, 'POST');
  },

  // Supprimer un email programmé
  delete: (id) => {
    console.log(`Appel API: suppression email programmé ${id}`);
    return apiRequest(`/scheduled-emails/${id}`, 'DELETE');
  },

  // Récupérer les emails liés à un élément
  getByRelated: (type, id) => {
    console.log(`Appel API: récupération emails programmés pour ${type}/${id}`);
    return apiRequest(`/scheduled-emails/related/${type}/${id}`);
  }
};

