// src/services/settingsAPI.js

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * Service API pour les paramètres de l'entreprise
 */

/**
 * Requête générique avec gestion d'erreurs
 */
const apiRequest = async (method, endpoint, data = null) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Pour inclure les cookies
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);

    if (!response.ok) {
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
};

export default settingsAPI;
