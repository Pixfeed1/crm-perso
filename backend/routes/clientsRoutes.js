// backend/routes/clientsRoutes.js
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');

/**
 * Routes pour la gestion des clients
 */

// GET /api/clients/stats - Récupérer les statistiques des clients
router.get('/stats', clientController.getClientStats);

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

module.exports = router;
