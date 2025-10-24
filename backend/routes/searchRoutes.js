// backend/routes/searchRoutes.js

const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

// Route de recherche globale
router.get('/', searchController.globalSearch);

module.exports = router;
