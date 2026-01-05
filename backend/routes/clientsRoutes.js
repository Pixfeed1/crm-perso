// backend/routes/clientsRoutes.js
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

/**
 * Routes pour la gestion des clients
 */

// GET /api/clients/stats - Récupérer les statistiques des clients
router.get('/stats', clientController.getClientStats);

// POST /api/clients/send-email - Envoyer un email générique (sans client requis)
router.post('/send-email', clientController.upload.array('attachments', 10), clientController.sendGenericEmail);

// POST /api/clients/send-generic-email - Alias pour compatibilité
router.post('/send-generic-email', clientController.upload.array('attachments', 10), clientController.sendGenericEmail);

// GET /api/clients - Récupérer tous les clients
router.get('/', clientController.getAllClients);

// GET /api/clients/:id - Récupérer un client spécifique
router.get('/:id', clientController.getClientById);

// POST /api/clients - Créer un nouveau client
router.post('/', clientController.createClient);

// POST /api/clients/convert/:leadId - Convertir un lead en client
router.post('/convert/:leadId', clientController.convertFromLead);

// PUT /api/clients/:id - Mettre à jour un client
router.put('/:id', clientController.updateClient);

// DELETE /api/clients/:id - Supprimer un client
router.delete('/:id', clientController.deleteClient);

// POST /api/clients/:id/send-email - Envoyer un email à un client (avec pièces jointes)
router.post('/:id/send-email', clientController.upload.array('attachments', 10), clientController.sendEmail);

module.exports = router;
