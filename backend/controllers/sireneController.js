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
        legalForm: getFormeJuridiqueLabel(company.nature_juridique),
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
        legalForm: getFormeJuridiqueLabel(company.nature_juridique),
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

/**
 * Convertit le code de forme juridique en libellé lisible
 */
const getFormeJuridiqueLabel = (code) => {
  if (!code) return 'Non spécifié';

  const formes = {
    // Entreprises individuelles
    '1000': 'Entrepreneur individuel',
    '1100': 'Artisan-commerçant',
    '1200': 'Commerçant',
    '1300': 'Artisan',
    '1400': 'Officier public ou ministériel',
    '1500': 'Profession libérale',
    '1600': 'Exploitant agricole',
    '1700': 'Agent commercial',

    // EURL
    '5498': 'EURL',

    // SARL
    '5499': 'SARL',
    '5505': 'SARL coopérative',
    '5510': 'SARL d\'HLM',
    '5515': 'SARL coopérative de construction',
    '5520': 'SARL d\'attribution',
    '5522': 'SARL coopérative d\'intérêt collectif pour l\'accession à la propriété',
    '5525': 'SARL d\'économie mixte à prépondérance privée',
    '5530': 'SARL d\'aménagement, de lotissement et de construction',
    '5531': 'SARL mixte de construction',
    '5532': 'SARL de gestion de fonds',
    '5542': 'SARL de bienfaisance',
    '5543': 'SARL d\'intérêt collectif',
    '5546': 'SARL de capitalisation',
    '5547': 'SARL de financement',
    '5548': 'SARL unipersonnelle',
    '5552': 'SARL de prévoyance',
    '5553': 'SARL de secours mutuels',
    '5554': 'SARL mixte d\'assurance',
    '5555': 'SARL de retraite supplémentaire',
    '5558': 'Société d\'exercice libéral à responsabilité limitée',
    '5585': 'SARL de courtage d\'assurances et de réassurance',

    // SAS
    '5710': 'SAS',
    '5720': 'SAS coopérative',
    '5770': 'Société d\'exercice libéral par action simplifiée',

    // SASU
    '5800': 'SASU',

    // SA
    '5599': 'SA',
    '5605': 'SA coopérative de production',
    '5610': 'SA d\'HLM',
    '5615': 'SA coopérative de construction',
    '5620': 'SA d\'attribution',
    '5622': 'SA coopérative d\'intérêt collectif pour l\'accession à la propriété',
    '5625': 'SA d\'économie mixte à prépondérance privée',
    '5630': 'SA d\'aménagement, de lotissement et de construction',
    '5631': 'SA mixte de construction',
    '5632': 'SA de gestion de fonds',
    '5642': 'SA de bienfaisance',
    '5643': 'SA d\'intérêt collectif',
    '5646': 'SA de capitalisation',
    '5647': 'SA de financement',
    '5648': 'SA d\'assurances mutuelles',
    '5651': 'SA nationale',
    '5652': 'SA de prévoyance',
    '5653': 'SA de secours mutuels',
    '5654': 'SA mixte d\'assurance',
    '5655': 'SA de retraite supplémentaire',
    '5658': 'Société d\'exercice libéral à forme anonyme',
    '5685': 'SA de courtage d\'assurances et de réassurance',

    // Sociétés civiles
    '6220': 'Groupement foncier agricole',
    '6316': 'CUMA',
    '6317': 'Société civile d\'exploitation agricole',
    '6318': 'Groupement agricole d\'exploitation en commun',
    '6411': 'Société civile de placement immobilier',
    '6521': 'SICAV',
    '6532': 'SICAF',
    '6533': 'Groupement d\'intérêt économique',
    '6534': 'GIE européen',
    '6535': 'Société civile coopérative entre médecins',
    '6536': 'SCP d\'avocats',
    '6537': 'SCP d\'avocats aux conseils',
    '6538': 'SCP d\'avoués d\'appel',
    '6539': 'SCP d\'huissiers',
    '6540': 'SCP de notaires',
    '6541': 'SCP de commissaires-priseurs',
    '6542': 'SCP de greffiers de tribunal de commerce',
    '6543': 'SCP de conseils juridiques',
    '6544': 'SCP de commissaires aux comptes',
    '6545': 'SCP de médecins',
    '6546': 'SCP de dentistes',
    '6547': 'SCP d\'infirmiers',
    '6548': 'SCP de masseurs-kinésithérapeutes',
    '6549': 'SCP de directeurs de laboratoire d\'analyse médicale',
    '6550': 'SCP de vétérinaires',
    '6551': 'SCP de géomètres-experts',
    '6552': 'SCP d\'architectes',
    '6553': 'SCP de conseils en propriété industrielle',
    '6554': 'SCP de mandataires judiciaires',
    '6555': 'SCP d\'experts-comptables',
    '6556': 'SCP de commissaires aux apports',
    '6557': 'SCP de courtage d\'assurances',
    '6558': 'SCP d\'administrateurs judiciaires',
    '6560': 'SCP de notaires d\'exercice exclusif',
    '6561': 'Autre SCP de professions libérales',
    '6595': 'Caisse locale de crédit mutuel',
    '6596': 'Caisse de crédit agricole mutuel',
    '6597': 'Société civile d\'intérêt collectif agricole',
    '6598': 'Groupement agricole foncier',
    '6599': 'Autre société civile',

    // Associations
    '9220': 'Association déclarée',
    '9221': 'Association non déclarée',
    '9222': 'Association inscrite au registre des associations',
    '9223': 'Association non inscrite au registre des associations',
    '9230': 'Association reconnue d\'utilité publique',
    '9240': 'Congrégation',
    '9260': 'Association de droit local (Alsace et Moselle)',
    '9300': 'Fondation'
  };

  return formes[code] || `Code ${code}`;
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
