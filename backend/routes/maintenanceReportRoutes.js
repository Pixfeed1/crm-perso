// backend/routes/maintenanceReportRoutes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/maintenanceReportController');

// Générer un rapport pour un projet
router.post('/project/:projectId/generate', reportController.generateReport);

// Générer un rapport pour un contrat de maintenance
router.post('/contract/:contractId/generate', reportController.generateContractReport);

// Récupérer les rapports d'un projet
router.get('/project/:projectId', reportController.getReportsByProject);

// Récupérer les rapports d'un contrat
router.get('/contract/:contractId', reportController.getReportsByContract);

// Récupérer un rapport par ID
router.get('/:id', reportController.getReportById);

// Prévisualiser un rapport (HTML)
router.get('/:id/preview', reportController.previewReport);

// Télécharger le PDF
router.get('/:id/pdf', reportController.downloadPDF);

// Mettre à jour un rapport
router.put('/:id', reportController.updateReport);

// Envoyer un rapport
router.post('/:id/send', reportController.sendReport);

// Supprimer un rapport
router.delete('/:id', reportController.deleteReport);

module.exports = router;
