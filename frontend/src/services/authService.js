// src/services/authService.js
/**
 * Service d'authentification pour gérer le token JWT et l'utilisateur
 */

// Clés utilisées pour le stockage local
const TOKEN_KEY = 'token';
const USER_DATA_KEY = 'user_data';

/**
 * Vérifie si un token JWT est expiré
 * @param {string} token - Le token JWT à vérifier
 * @returns {boolean} - True si le token est expiré, sinon false
 */
export const isTokenExpired = (token) => {
  if (!token) return true;
  
  try {
    // Décode le payload du token (2ème partie)
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(window.atob(base64));
    
    // Vérifie l'expiration
    const expirationTime = payload.exp * 1000; // Convertir en millisecondes
    const currentTime = Date.now();
    
    // Log pour le debug
    console.log('Vérification d\'expiration du token:', {
      expire: new Date(expirationTime).toISOString(),
      current: new Date(currentTime).toISOString(),
      isExpired: currentTime > expirationTime
    });
    
    return currentTime > expirationTime;
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'expiration du token:', error);
    return true; // En cas d'erreur, considérer que le token est expiré
  }
};

/**
 * Récupère le token d'authentification depuis le localStorage
 * @returns {string|null} - Le token JWT ou null si non trouvé
 */
export const getAuthToken = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (token && isTokenExpired(token)) {
    console.warn('Token expiré détecté lors de la récupération');
    clearAuth();
    return null;
  }
  
  return token;
};

/**
 * Sauvegarde le token et les données utilisateur dans le localStorage
 * @param {string} token - Le token JWT
 * @param {Object} userData - Les données de l'utilisateur
 */
export const setAuth = (token, userData) => {
  localStorage.setItem(TOKEN_KEY, token);
  
  if (userData) {
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
  }
  
  console.log('Données d\'authentification sauvegardées avec succès');
};

/**
 * Efface les informations d'authentification du localStorage
 */
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
  console.log('Données d\'authentification supprimées');
};

/**
 * Récupère les données de l'utilisateur connecté
 * @returns {Object|null} - Les données utilisateur ou null si non connecté
 */
export const getUserData = () => {
  try {
    const userDataStr = localStorage.getItem(USER_DATA_KEY);
    return userDataStr ? JSON.parse(userDataStr) : null;
  } catch (error) {
    console.error('Erreur lors de la récupération des données utilisateur:', error);
    return null;
  }
};

/**
 * Vérifie si l'utilisateur est actuellement authentifié
 * @returns {boolean} - True si l'utilisateur est authentifié
 */
export const isAuthenticated = () => {
  const token = getAuthToken();
  return Boolean(token);
};

/**
 * Vérifie le rôle de l'utilisateur
 * @param {string} role - Le rôle à vérifier
 * @returns {boolean} - True si l'utilisateur a le rôle spécifié
 */
export const hasRole = (role) => {
  const userData = getUserData();
  return userData && userData.role === role;
};

/**
 * Met à jour les données utilisateur dans le localStorage
 * @param {Object} newData - Nouvelles données à fusionner
 */
export const updateUserData = (newData) => {
  const userData = getUserData();
  
  if (userData) {
    const updatedData = { ...userData, ...newData };
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(updatedData));
    console.log('Données utilisateur mises à jour');
  }
};

// Exporter les fonctions principales
export default {
  getAuthToken,
  setAuth,
  clearAuth,
  isTokenExpired,
  getUserData,
  isAuthenticated,
  hasRole,
  updateUserData
};