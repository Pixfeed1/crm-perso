// src/services/externalAPI.js
/**
 * Service pour les appels aux APIs externes (Sirene, Adresse)
 */

// ===== API SIRENE (INSEE) - Recherche d'entreprises françaises =====
// Documentation: https://api.insee.fr/catalogue/

const SIRENE_API_URL = 'https://entreprise.data.gouv.fr/api/sirene/v3';

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
    // Encoder la requête pour l'URL
    const encodedQuery = encodeURIComponent(query);

    // Appel à l'API Sirene - recherche dans la dénomination
    // NOTE: L'API entreprise.data.gouv.fr peut avoir des problèmes de connexion
    // Si l'API est indisponible, on retourne un tableau vide sans bloquer l'interface
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout 5 secondes

    const response = await fetch(
      `${SIRENE_API_URL}/unites_legales?q=${encodedQuery}&nombre=10&champs=siren,denominationUniteLegale,categorieJuridiqueUniteLegale,activitePrincipaleUniteLegale,nomenclatureActivitePrincipaleUniteLegale,trancheEffectifsUniteLegale`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('API Sirene indisponible (statut:', response.status, '). L\'auto-complétion est désactivée.');
      return [];
    }

    const data = await response.json();

    // Formater les résultats pour l'auto-complétion
    if (data.unite_legale && data.unite_legale.length > 0) {
      return data.unite_legale.map(company => ({
        siren: company.siren,
        name: company.denomination_unite_legale || company.denomination_usuelle_unite_legale_1 || 'Nom non disponible',
        legalForm: getCategorieJuridiqueLabel(company.categorie_juridique_unite_legale),
        activity: company.activite_principale_unite_legale,
        activityLabel: getNafLabel(company.activite_principale_unite_legale),
        employees: getTrancheEffectifsLabel(company.tranche_effectifs_unite_legale)
      }));
    }

    return [];
  } catch (error) {
    // Si l'API est down (ERR_CONNECTION_RESET, timeout, etc.), on retourne vide
    // L'utilisateur peut toujours saisir manuellement le nom de l'entreprise
    if (error.name === 'AbortError') {
      console.warn('API Sirene timeout (>5s). Saisie manuelle uniquement.');
    } else {
      console.warn('API Sirene inaccessible:', error.message, '. Saisie manuelle uniquement.');
    }
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `${SIRENE_API_URL}/unites_legales/${siren}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('API Sirene (détails) indisponible:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.unite_legale) {
      const company = data.unite_legale;

      return {
        siren: company.siren,
        siret: company.etablissements?.[0]?.siret || null,
        name: company.denomination_unite_legale || company.denomination_usuelle_unite_legale_1,
        legalForm: getCategorieJuridiqueLabel(company.categorie_juridique_unite_legale),
        activity: company.activite_principale_unite_legale,
        activityLabel: getNafLabel(company.activite_principale_unite_legale),
        employees: getTrancheEffectifsLabel(company.tranche_effectifs_unite_legale),
        address: company.etablissements?.[0] ? formatSireneAddress(company.etablissements[0]) : null,
        creationDate: company.date_creation_unite_legale
      };
    }

    return null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('API Sirene (détails) timeout.');
    } else {
      console.warn('API Sirene (détails) inaccessible:', error.message);
    }
    return null;
  }
};

/**
 * Formate l'adresse depuis les données Sirene
 */
const formatSireneAddress = (etablissement) => {
  const parts = [];

  if (etablissement.geo_l4) parts.push(etablissement.geo_l4);
  if (etablissement.geo_l5) parts.push(etablissement.geo_l5);

  const cityParts = [];
  if (etablissement.code_postal_etablissement) cityParts.push(etablissement.code_postal_etablissement);
  if (etablissement.libelle_commune_etablissement) cityParts.push(etablissement.libelle_commune_etablissement);

  if (cityParts.length > 0) parts.push(cityParts.join(' '));

  return parts.join(', ');
};

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

// ===== HELPERS =====

/**
 * Convertit le code catégorie juridique en libellé lisible
 */
const getCategorieJuridiqueLabel = (code) => {
  const categories = {
    '5499': 'SA',
    '5710': 'SAS',
    '5720': 'SASU',
    '5498': 'SARL',
    '5505': 'EURL',
    '1000': 'Entrepreneur individuel',
    '6540': 'Auto-entrepreneur',
    '9220': 'Association',
    '7210': 'EPIC'
  };

  return categories[code] || code || 'Non spécifié';
};

/**
 * Obtient le libellé d'un code NAF/APE
 * Note: Pour une vraie application, utiliser une table de correspondance complète
 */
const getNafLabel = (code) => {
  if (!code) return 'Non spécifié';

  // Exemples de codes NAF courants
  const nafCodes = {
    '62.01Z': 'Programmation informatique',
    '62.02A': 'Conseil en systèmes et logiciels informatiques',
    '70.22Z': 'Conseil pour les affaires et autres conseils de gestion',
    '47.91A': 'Vente à distance sur catalogue général',
    '47.91B': 'Vente à distance sur catalogue spécialisé',
    '73.11Z': 'Activités des agences de publicité',
    '82.11Z': 'Services administratifs combinés de bureau'
  };

  return nafCodes[code] || `Code NAF ${code}`;
};

/**
 * Convertit la tranche d'effectifs en libellé
 */
const getTrancheEffectifsLabel = (code) => {
  const tranches = {
    '00': '0 salarié',
    '01': '1 ou 2 salariés',
    '02': '3 à 5 salariés',
    '03': '6 à 9 salariés',
    '11': '10 à 19 salariés',
    '12': '20 à 49 salariés',
    '21': '50 à 99 salariés',
    '22': '100 à 199 salariés',
    '31': '200 à 249 salariés',
    '32': '250 à 499 salariés',
    '41': '500 à 999 salariés',
    '42': '1000 à 1999 salariés',
    '51': '2000 à 4999 salariés',
    '52': '5000 à 9999 salariés',
    '53': '10000 salariés et plus'
  };

  return tranches[code] || 'Non communiqué';
};
