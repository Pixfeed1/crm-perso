// src/services/externalAPI.js
/**
 * Service pour les appels aux APIs externes (Sirene, Adresse)
 */

// ===== API SIRENE (INSEE) - Recherche d'entreprises françaises =====
// Documentation: https://api.insee.fr/catalogue/
// NOTE: Appels via le backend pour éviter les problèmes CORS

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

/**
 * Recherche d'entreprises dans la base Sirene
 * @param {string} query - Nom de l'entreprise à rechercher
 * @returns {Promise<Array>} Liste des entreprises trouvées
 */
export const searchCompanies = async (query) => {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    // Appel au backend qui sert de proxy pour l'API Sirene
    // Cela évite les problèmes CORS et de connexion directe
    const response = await fetch(
      `${API_BASE_URL}/sirene/search?q=${encodeURIComponent(query)}`,
      {
        credentials: 'include', // Inclure les cookies d'authentification
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.warn('Backend proxy Sirene indisponible (statut:', response.status, ')');
      return [];
    }

    const data = await response.json();

    // Le backend retourne déjà les données formatées
    return data;

  } catch (error) {
    console.warn('Erreur lors de la recherche d\'entreprises:', error.message);
    return [];
  }
};

/**
 * Récupère les détails complets d'une entreprise par son SIREN
 * @param {string} siren - Numéro SIREN (9 chiffres)
 * @returns {Promise<Object|null>} Détails de l'entreprise
 */
export const getCompanyDetails = async (siren) => {
  if (!siren || siren.length !== 9) {
    return null;
  }

  try {
    // Appel au backend qui sert de proxy pour l'API Sirene
    const response = await fetch(
      `${API_BASE_URL}/sirene/details/${siren}`,
      {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.warn('Backend proxy Sirene (détails) indisponible:', response.status);
      return null;
    }

    const data = await response.json();

    // Le backend retourne déjà les données formatées
    return data;

  } catch (error) {
    console.warn('Erreur lors de la récupération des détails:', error.message);
    return null;
  }
};

// NOTE: Les fonctions de formatage (formatSireneAddress, getCategorieJuridiqueLabel, etc.)
// ont été déplacées vers le backend (sireneController.js) car les données sont
// maintenant formatées côté serveur avant d'être envoyées au frontend.

// ===== API ADRESSE (data.gouv.fr) - Géocodage français =====
// Documentation: https://adresse.data.gouv.fr/api-doc/adresse

const ADRESSE_API_URL = 'https://api-adresse.data.gouv.fr';

/**
 * Recherche d'adresses françaises avec auto-complétion
 * @param {string} query - Début de l'adresse à rechercher
 * @returns {Promise<Array>} Liste des adresses trouvées
 */
export const searchAddresses = async (query) => {
  if (!query || query.length < 3) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query);

    const response = await fetch(
      `${ADRESSE_API_URL}/search/?q=${encodedQuery}&limit=10&autocomplete=1`
    );

    if (!response.ok) {
      console.error('Erreur API Adresse:', response.status);
      return [];
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      return data.features.map(feature => ({
        label: feature.properties.label,
        name: feature.properties.name,
        postcode: feature.properties.postcode,
        city: feature.properties.city,
        context: feature.properties.context,
        street: feature.properties.street,
        housenumber: feature.properties.housenumber,
        coordinates: feature.geometry.coordinates, // [longitude, latitude]
        score: feature.properties.score
      }));
    }

    return [];
  } catch (error) {
    console.error('Erreur lors de la recherche d\'adresse:', error);
    return [];
  }
};

/**
 * Géocodage inverse : obtenir l'adresse à partir de coordonnées
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object|null>} Adresse trouvée
 */
export const reverseGeocode = async (lat, lon) => {
  try {
    const response = await fetch(
      `${ADRESSE_API_URL}/reverse/?lon=${lon}&lat=${lat}`
    );

    if (!response.ok) {
      console.error('Erreur API Adresse (reverse):', response.status);
      return null;
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        label: feature.properties.label,
        postcode: feature.properties.postcode,
        city: feature.properties.city
      };
    }

    return null;
  } catch (error) {
    console.error('Erreur lors du géocodage inverse:', error);
    return null;
  }
};

// Les fonctions helper (getCategorieJuridiqueLabel, getNafLabel, getTrancheEffectifsLabel)
// ont été déplacées vers le backend (sireneController.js)
