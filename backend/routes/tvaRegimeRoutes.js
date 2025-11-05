const express = require('express');
const router = express.Router();
const tvaRegimeController = require('../controllers/tvaRegimeController');

/**
 * Routes pour les régimes de TVA
 */

/**
 * @route   GET /api/tva-regimes
 * @desc    Récupère tous les régimes de TVA actifs
 * @access  Public
 */
router.get('/', tvaRegimeController.getAllRegimes);

/**
 * @route   GET /api/tva-regimes/:code
 * @desc    Récupère un régime de TVA par son code
 * @access  Public
 */
router.get('/:code', tvaRegimeController.getRegimeByCode);

/**
 * @route   GET /api/tva-regimes/category/:category
 * @desc    Récupère les régimes de TVA par catégorie
 * @access  Public
 */
router.get('/category/:category', tvaRegimeController.getRegimesByCategory);

module.exports = router;
