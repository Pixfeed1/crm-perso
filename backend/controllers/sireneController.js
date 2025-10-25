// backend/controllers/sireneController.js
/**
 * Contrôleur pour l'API Sirene (INSEE)
 * Proxy pour éviter les problèmes CORS dans le navigateur
 */

const axios = require('axios');

const SIRENE_API_URL = 'https://entreprise.data.gouv.fr/api/sirene/v3';

/**
 * Recherche d'entreprises dans la base Sirene
 * GET /api/sirene/search?q=nom_entreprise
 */
exports.searchCompanies = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    // Encoder la requête pour l'URL
    const encodedQuery = encodeURIComponent(q);

    // Appel à l'API Sirene avec timeout de 5 secondes
    const response = await axios.get(
      `${SIRENE_API_URL}/unites_legales?q=${encodedQuery}&nombre=10&champs=siren,denominationUniteLegale,categorieJuridiqueUniteLegale,activitePrincipaleUniteLegale,nomenclatureActivitePrincipaleUniteLegale,trancheEffectifsUniteLegale`,
      { timeout: 5000 }
    );

    const data = response.data;

    // Formater les résultats
    if (data.unite_legale && data.unite_legale.length > 0) {
      const results = data.unite_legale.map(company => ({
        siren: company.siren,
        name: company.denomination_unite_legale || company.denomination_usuelle_unite_legale_1 || 'Nom non disponible',
        legalForm: getCategorieJuridiqueLabel(company.categorie_juridique_unite_legale),
        activity: company.activite_principale_unite_legale,
        activityLabel: getNafLabel(company.activite_principale_unite_legale),
        employees: getTrancheEffectifsLabel(company.tranche_effectifs_unite_legale)
      }));

      return res.json(results);
    }

    return res.json([]);

  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      console.warn('API Sirene timeout (>5s)');
    } else if (error.response) {
      console.warn(`API Sirene indisponible (statut: ${error.response.status})`);
    } else {
      console.error('Erreur API Sirene:', error.message);
    }
    return res.json([]);
  }
};

/**
 * Récupère les détails complets d'une entreprise par son SIREN
 * GET /api/sirene/details/:siren
 */
exports.getCompanyDetails = async (req, res) => {
  try {
    const { siren } = req.params;

    if (!siren || siren.length !== 9) {
      return res.status(400).json({ error: 'SIREN invalide (doit contenir 9 chiffres)' });
    }

    const response = await axios.get(
      `${SIRENE_API_URL}/unites_legales/${siren}`,
      { timeout: 5000 }
    );

    const data = response.data;

    if (data.unite_legale) {
      const company = data.unite_legale;

      const details = {
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

      return res.json(details);
    }

    return res.status(404).json({ error: 'Entreprise non trouvée' });

  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      console.warn('API Sirene (détails) timeout');
      return res.status(504).json({ error: 'Timeout lors de la récupération des détails' });
    } else if (error.response) {
      console.warn(`API Sirene (détails) indisponible: ${error.response.status}`);
      return res.status(error.response.status).json({ error: 'API Sirene indisponible' });
    } else {
      console.error('Erreur API Sirene (détails):', error.message);
      return res.status(500).json({ error: 'Erreur lors de la récupération des détails' });
    }
  }
};

// ===== HELPERS =====

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
 */
const getNafLabel = (code) => {
  if (!code) return 'Non spécifié';

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
