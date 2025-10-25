// backend/controllers/sireneController.js
/**
 * Contrôleur pour l'API Sirene (INSEE)
 * Proxy pour éviter les problèmes CORS dans le navigateur
 */

const axios = require('axios');

// NOUVELLE API OFFICIELLE (entreprise.data.gouv.fr a été fermée en septembre 2022)
// Documentation: https://annuaire-entreprises.data.gouv.fr/donnees/api-entreprises
const SIRENE_API_URL = 'https://recherche-entreprises.api.gouv.fr';

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

    // Appel à la NOUVELLE API officielle (recherche-entreprises.api.gouv.fr)
    // Format: https://recherche-entreprises.api.gouv.fr/search?q=nom&per_page=10
    const response = await axios.get(`${SIRENE_API_URL}/search`, {
      params: {
        q: q,
        page: 1,
        per_page: 10
      },
      headers: {
        'User-Agent': 'CRM-App/1.0',
        'Accept': 'application/json'
      },
      timeout: 5000
    });

    const data = response.data;

    // Formater les résultats selon la nouvelle structure API
    if (data.results && data.results.length > 0) {
      const results = data.results.map(company => ({
        siren: company.siren,
        name: company.nom_complet || company.nom_raison_sociale || 'Nom non disponible',
        legalForm: company.nature_juridique || 'Non spécifié',
        activity: company.activite_principale,
        activityLabel: company.libelle_activite_principale || `Code NAF ${company.activite_principale}`,
        employees: company.tranche_effectif_salarie ? getTrancheEffectifsLabel(company.tranche_effectif_salarie) : 'Non communiqué',
        address: company.siege ? formatAddress(company.siege) : null
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
 * Formate l'adresse depuis les données de siège
 */
const formatAddress = (siege) => {
  if (!siege) return null;

  const parts = [];
  if (siege.numero_voie && siege.type_voie && siege.libelle_voie) {
    parts.push(`${siege.numero_voie} ${siege.type_voie} ${siege.libelle_voie}`);
  } else if (siege.libelle_voie) {
    parts.push(siege.libelle_voie);
  }

  if (siege.code_postal && siege.libelle_commune) {
    parts.push(`${siege.code_postal} ${siege.libelle_commune}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
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

    // Recherche par SIREN sur la nouvelle API
    const response = await axios.get(`${SIRENE_API_URL}/search`, {
      params: {
        q: siren,
        page: 1,
        per_page: 1
      },
      headers: {
        'User-Agent': 'CRM-App/1.0',
        'Accept': 'application/json'
      },
      timeout: 5000
    });

    const data = response.data;

    if (data.results && data.results.length > 0) {
      const company = data.results[0];

      const details = {
        siren: company.siren,
        siret: company.siege?.siret || null,
        name: company.nom_complet || company.nom_raison_sociale,
        legalForm: company.nature_juridique || 'Non spécifié',
        activity: company.activite_principale,
        activityLabel: company.libelle_activite_principale || `Code NAF ${company.activite_principale}`,
        employees: company.tranche_effectif_salarie ? getTrancheEffectifsLabel(company.tranche_effectif_salarie) : 'Non communiqué',
        address: company.siege ? formatAddress(company.siege) : null,
        creationDate: company.date_creation || null
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
// Note: La nouvelle API recherche-entreprises.api.gouv.fr fournit déjà
// les libellés formatés, donc nous n'avons besoin que de helpers simples

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
