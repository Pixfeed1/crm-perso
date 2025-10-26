const express = require('express');
const router = express.Router();
const prospectionController = require('../controllers/prospectionController');

/**
 * Routes pour la prospection automatisée
 * Intègre : Pôle Emploi, Google Jobs, BOAMP, Data.gouv
 */

/**
 * @route   GET /api/prospection/test/pole-emploi
 * @desc    Test de connexion à l'API Pôle Emploi
 * @access  Private (authentifié)
 */
router.get('/test/pole-emploi', prospectionController.testPoleEmploi);

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

module.exports = router;
