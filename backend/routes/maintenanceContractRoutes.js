// backend/routes/maintenanceContractRoutes.js
const express = require('express');
const router = express.Router();
const contractController = require('../controllers/maintenanceContractController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentification requise pour toutes les routes
router.use(authMiddleware);

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

// Contrat complet et conditions à télécharger
router.get('/:id/contrat', contractController.getContrat);
router.put('/:id/contrat', contractController.saveContrat);
router.get('/:id/contrat/pdf', contractController.downloadContrat);
router.get('/:id/conditions/pdf', contractController.downloadConditions);

// POST /api/maintenance-contracts/:id/billing/checkout - Créer la session de prélèvement (Stripe)
router.post('/:id/billing/checkout', contractController.createBillingCheckout);

// POST /api/maintenance-contracts/:id/billing/send-link - Envoyer le lien de prélèvement au client
router.post('/:id/billing/send-link', contractController.sendBillingLink);

// POST /api/maintenance-contracts/:id/billing/cancel - Résilier l'abonnement (body { immediate? })
router.post('/:id/billing/cancel', contractController.cancelBilling);

// POST /api/maintenance-contracts/:id/billing/resume - Réactiver l'abonnement (annule la résiliation programmée)
router.post('/:id/billing/resume', contractController.resumeBilling);
// Vérifier auprès de Stripe : aligne le statut du prélèvement sur Stripe (webhook manqué)
router.post('/:id/billing/sync', require('../services/maintenanceBillingService').syncRoute('maintenance_contracts'));

// Mail de bienvenue : aperçu, puis envoi (ou renvoi) depuis la fiche du contrat
const bienvenue = require('../services/bienvenueService').routes('maintenance_contracts');
router.get('/:id/welcome', bienvenue.apercu);
router.get('/:id/welcome/pdf', bienvenue.pdf);
router.post('/:id/welcome', bienvenue.envoyer);

// DELETE /api/maintenance-contracts/:id - Supprimer un contrat
router.delete('/:id', contractController.deleteContract);

module.exports = router;
