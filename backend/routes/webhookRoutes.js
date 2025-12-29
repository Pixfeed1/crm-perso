// backend/routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

/**
 * Routes webhook publiques (sans authentification)
 * Ces routes sont accessibles depuis l'extérieur pour permettre l'intégration avec des systèmes tiers
 */

/**
 * POST /api/webhooks/maintenance
 * Webhook pour créer automatiquement un client + projet maintenance WordPress après paiement Stripe
 *
 * Body attendu:
 * {
 *   "name": "Jean Dupont",
 *   "email": "jean@example.com",
 *   "phone": "0612345678",
 *   "company": "Agence XYZ",
 *   "source": "stripe_maintenance_wordpress",
 *   "notes": "Forfait Pro - 99€/mois",
 *   "tags": "maintenance,wordpress,forfait-pro",
 *   "status": "active",
 *   "lifetime_value": 99,
 *   "contract_start_date": "2024-12-29T10:00:00Z",
 *   "type": "company",
 *   "plan": "Pro",
 *   "plan_price": 99
 * }
 *
 * Réponse:
 * {
 *   "success": true,
 *   "client_id": 123,
 *   "project_id": 456,
 *   "client": { "id": 123, "name": "Jean Dupont", "email": "jean@example.com" },
 *   "project": { "id": 456, "name": "Maintenance WordPress - Pro" }
 * }
 */
router.post('/maintenance', webhookController.handleMaintenanceWebhook);

module.exports = router;
