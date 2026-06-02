// backend/routes/clientsRoutes.js
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const authMiddleware = require('../middleware/authMiddleware');

// Authentification requise pour toutes les routes
router.use(authMiddleware);

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

// POST /api/clients/import - Importer plusieurs clients depuis JSON
router.post('/import', async (req, res) => {
  const db = req.app.locals.db;
  const clientModel = require('../models/clientModel');
  const { clients: clientsToImport } = req.body;

  if (!Array.isArray(clientsToImport) || clientsToImport.length === 0) {
    return res.status(400).json({ message: 'Un tableau de clients est requis' });
  }

  const results = { success: [], errors: [] };

  for (const clientData of clientsToImport) {
    try {
      if (!clientData.name) {
        results.errors.push({ client: clientData, error: 'Nom requis' });
        continue;
      }

      const client = await clientModel.createClient(db, {
        name: clientData.name,
        company: clientData.company || null,
        type: clientData.type || 'individual',
        status: clientData.status || 'active',
        email: clientData.email || null,
        phone: clientData.phone || null,
        address: clientData.address || null,
        website: clientData.website || null,
        industry: clientData.industry || null,
        source: clientData.source || null,
        contract_start_date: clientData.contract_start_date || null,
        lifetime_value: clientData.lifetime_value || 0,
        notes: clientData.notes || null,
        tags: clientData.tags || null,
        lead_id: clientData.lead_id || null
      });

      results.success.push(client);
    } catch (error) {
      results.errors.push({ client: clientData, error: error.message });
    }
  }

  res.status(201).json({
    message: `${results.success.length} client(s) importé(s), ${results.errors.length} erreur(s)`,
    imported: results.success,
    errors: results.errors
  });
});

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
