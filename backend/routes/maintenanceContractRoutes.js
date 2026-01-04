// backend/routes/maintenanceContractRoutes.js
const express = require('express');
const router = express.Router();
const contractController = require('../controllers/maintenanceContractController');

/**
 * Routes pour la gestion des contrats de maintenance WordPress
 */

// GET /api/maintenance-contracts/stats - Récupérer les statistiques
router.get('/stats', contractController.getStats);

// GET /api/maintenance-contracts - Récupérer tous les contrats
router.get('/', contractController.getAllContracts);

// GET /api/maintenance-contracts/:id - Récupérer un contrat spécifique
router.get('/:id', contractController.getContractById);

// POST /api/maintenance-contracts - Créer un nouveau contrat
router.post('/', contractController.createContract);

// PUT /api/maintenance-contracts/:id - Mettre à jour un contrat
router.put('/:id', contractController.updateContract);

// PUT /api/maintenance-contracts/:id/pagespeed - Mettre à jour les scores PageSpeed
router.put('/:id/pagespeed', contractController.updatePageSpeed);

// DELETE /api/maintenance-contracts/:id - Supprimer un contrat
router.delete('/:id', contractController.deleteContract);

module.exports = router;
