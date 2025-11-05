// backend/routes/sireneRoutes.js
const express = require('express');
const router = express.Router();
const sireneController = require('../controllers/sireneController');

/**
 * @route   GET /api/sirene/search
 * @desc    Rechercher des entreprises dans la base Sirene
 * @query   q - Nom de l'entreprise à rechercher
 * @access  Private (authentifié)
 */
router.get('/search', sireneController.searchCompanies);

/**
 * @route   GET /api/sirene/details/:siren
 * @desc    Obtenir les détails complets d'une entreprise par son SIREN
 * @params  siren - Numéro SIREN (9 chiffres)
 * @access  Private (authentifié)
 */
router.get('/details/:siren', sireneController.getCompanyDetails);

module.exports = router;
