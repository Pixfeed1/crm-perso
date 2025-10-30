// src/services/settingsAPI.js

import { getAuthToken, clearAuth, isTokenExpired } from './authService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * Service API pour les paramètres de l'entreprise
 */

/**
 * Requête générique avec gestion d'erreurs et authentification
 */
const apiRequest = async (method, endpoint, data = null) => {
  // Récupérer le token d'authentification
  const token = getAuthToken();

  // Vérifier si le token est expiré
  if (token && isTokenExpired(token)) {
    console.log('Token expiré détecté avant la requête');
    clearAuth();
    window.location.href = '/login?session=expired';
    throw new Error('Session expirée. Redirection vers la page de connexion...');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    },
    credentials: 'include',
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);

    if (!response.ok) {
      // Gestion spéciale des erreurs d'authentification (401)
      if (response.status === 401) {
        console.log('Erreur 401 détecté, redirection vers la page de login');
        clearAuth();
        window.location.href = '/login?session=expired';
        throw new Error('Session expirée. Redirection vers la page de connexion...');
      }

      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erreur ${response.status}`);
    }

    // Si la réponse est vide (204 No Content), retourner null
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`[settingsAPI] Erreur ${method} ${endpoint}:`, error);
    throw error;
  }
};

/**
 * API pour les paramètres de l'entreprise
 */
export const settingsAPI = {
  /**
   * Récupère les paramètres de l'entreprise
   */
  getSettings: async () => {
    return apiRequest('GET', '/api/settings');
  },

  /**
   * Met à jour les paramètres de l'entreprise
   */
  updateSettings: async (settingsData) => {
    return apiRequest('PUT', '/api/settings', settingsData);
  },

  /**
   * Met à jour le logo de l'entreprise
   */
  updateLogo: async (logoUrl) => {
    return apiRequest('POST', '/api/settings/logo', { logo_url: logoUrl });
  },

  /**
   * Teste la configuration email SMTP
   */
  testEmail: async () => {
    return apiRequest('POST', '/api/settings/test-email');
  },
};

export default settingsAPI;
