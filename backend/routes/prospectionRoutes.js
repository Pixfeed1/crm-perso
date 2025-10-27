const express = require('express');
const router = express.Router();
const prospectionController = require('../controllers/prospectionController');

/**
 * Routes pour la prospection automatisée
 * Intègre : Pôle Emploi, Google Jobs, SIRENE (INSEE), Pappers, BOAMP, Data.gouv
 */

/**
 * @route   GET /api/prospection/test/pole-emploi
 * @desc    Test de connexion à l'API Pôle Emploi
 * @access  Private (authentifié)
 */
router.get('/test/pole-emploi', prospectionController.testPoleEmploi);

/**
 * @route   GET /api/prospection/test/google-jobs
 * @desc    Test de connexion à l'API Google Jobs (JSearch)
 * @access  Private (authentifié)
 */
router.get('/test/google-jobs', prospectionController.testGoogleJobs);

/**
 * @route   GET /api/prospection/pole-emploi/search
 * @desc    Recherche d'opportunités via Pôle Emploi uniquement
 * @query   keywords - Mots-clés de recherche (requis)
 * @query   department - Code département (optionnel)
 * @query   commune - Code INSEE commune (optionnel)
 * @query   distance - Distance en km (défaut: 10)
 * @query   typeContrat - Type de contrat: CDI, CDD, etc.
 * @query   experience - Niveau: D, E, S
 * @access  Private (authentifié)
 */
router.get('/pole-emploi/search', prospectionController.searchPoleEmploi);

/**
 * @route   GET /api/prospection/pole-emploi/offer/:offerId
 * @desc    Récupère les détails d'une offre Pôle Emploi
 * @params  offerId - ID de l'offre
 * @access  Private (authentifié)
 */
router.get('/pole-emploi/offer/:offerId', prospectionController.getPoleEmploiOffer);

/**
 * @route   GET /api/prospection/search
 * @desc    Recherche multi-sources (Pôle Emploi + Google Jobs + BOAMP)
 * @query   keywords - Mots-clés de recherche (requis)
 * @query   location - Localisation (département ou code postal)
 * @query   sources - Sources séparées par virgules (défaut: pole-emploi)
 *                    Options: pole-emploi, google-jobs, boamp
 * @access  Private (authentifié)
 *
 * @example /api/prospection/search?keywords=refonte site&location=75&sources=pole-emploi,google-jobs
 */
router.get('/search', prospectionController.searchOpportunities);

/**
 * @route   POST /api/prospection/import-lead
 * @desc    Importe une opportunité comme lead dans le CRM
 * @body    opportunity - Données de l'opportunité à importer
 * @access  Private (authentifié)
 *
 * @example
 * {
 *   "opportunity": {
 *     "company_name": "Acme Corp",
 *     "email": "contact@acme.com",
 *     "phone": "0601020304",
 *     "city": "Paris",
 *     "department": "75",
 *     "sector": "IT",
 *     "source": "pole-emploi",
 *     "notes": "Recherche développeur web..."
 *   }
 * }
 */
router.post('/import-lead', prospectionController.importOpportunityAsLead);

// ============================================================================
// SIRENE (INSEE) - Recherche d'entreprises
// ============================================================================

/**
 * @route   GET /api/prospection/test/sirene
 * @desc    Test de connexion à l'API SIRENE (INSEE)
 * @access  Private (authentifié)
 */
router.get('/test/sirene', prospectionController.testSirene);

/**
 * @route   GET /api/prospection/sirene/search
 * @desc    Recherche d'entreprises via SIRENE (INSEE)
 * @query   nafCode - Code NAF/APE (ex: "43.21A" pour plomberie)
 * @query   city - Ville (ex: "Clichy")
 * @query   postalCode - Code postal (ex: "92110")
 * @query   department - Département (ex: "92", "2A", "971")
 * @query   region - Région (ex: "11" pour Île-de-France)
 * @query   companyName - Raison sociale (recherche partielle)
 * @query   minEmployees - Effectif minimum
 * @query   maxEmployees - Effectif maximum
 * @query   limit - Nombre max de résultats (défaut: 100, max: 1000)
 * @access  Private (authentifié)
 *
 * @example /api/prospection/sirene/search?nafCode=43.21A&city=Clichy&limit=50
 * @example /api/prospection/sirene/search?nafCode=62.01&department=92&minEmployees=10&maxEmployees=50
 */
router.get('/sirene/search', prospectionController.searchSirene);

// ============================================================================
// PAPPERS - Enrichissement de données entreprises
// ============================================================================

/**
 * @route   GET /api/prospection/test/pappers
 * @desc    Test de connexion à l'API Pappers
 * @access  Private (authentifié)
 */
router.get('/test/pappers', prospectionController.testPappers);

/**
 * @route   GET /api/prospection/pappers/credits
 * @desc    Obtient le statut des crédits Pappers
 * @access  Private (authentifié)
 * @returns {
 *   "success": true,
 *   "credits": {
 *     "used": 15,
 *     "remaining": 85,
 *     "total": 100,
 *     "percentage": 85,
 *     "is_low": false,
 *     "is_depleted": false,
 *     "last_reset": "2025-10-01T00:00:00.000Z",
 *     "next_reset": "2025-11-01T00:00:00.000Z"
 *   }
 * }
 */
router.get('/pappers/credits', prospectionController.getPappersCredits);

/**
 * @route   POST /api/prospection/pappers/enrich
 * @desc    Enrichit une entreprise avec Pappers (consomme 1 crédit)
 * @body    siren - Numéro SIREN (9 chiffres)
 * @access  Private (authentifié)
 *
 * @example
 * {
 *   "siren": "123456789"
 * }
 *
 * @returns {
 *   "success": true,
 *   "data": {
 *     "siren": "123456789",
 *     "phone": "0142123456",
 *     "email": "contact@entreprise.fr",
 *     "website": "https://www.entreprise.fr",
 *     "executives": [...],
 *     "employees": 25,
 *     "revenue": 1500000
 *   },
 *   "credits": { ... }
 * }
 */
router.post('/pappers/enrich', prospectionController.enrichWithPappers);

/**
 * @route   POST /api/prospection/pappers/enrich-multiple
 * @desc    Enrichit plusieurs entreprises avec Pappers
 * @body    sirens - Array de numéros SIREN
 * @body    maxEnrich - Nombre max à enrichir (optionnel, défaut: 10)
 * @access  Private (authentifié)
 *
 * @example
 * {
 *   "sirens": ["123456789", "987654321", "456789123"],
 *   "maxEnrich": 3
 * }
 *
 * @returns {
 *   "success": true,
 *   "enriched": [...],
 *   "errors": [...],
 *   "credits_remaining": 85,
 *   "skipped": 0
 * }
 */
router.post('/pappers/enrich-multiple', prospectionController.enrichMultipleWithPappers);

module.exports = router;
