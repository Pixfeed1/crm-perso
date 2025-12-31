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

/**
 * POST /api/webhooks/stripe-payment
 * Webhook pour enregistrer un paiement mensuel récurrent
 * Appelé par WordPress après réception de invoice.payment_succeeded de Stripe
 *
 * Body attendu:
 * {
 *   "stripe_subscription_id": "sub_xxxxx",
 *   "stripe_invoice_id": "in_xxxxx",
 *   "stripe_payment_intent_id": "pi_xxxxx",
 *   "amount": 99,
 *   "next_billing_date": "2025-02-29T10:00:00Z",
 *   "invoice_url": "https://invoice.stripe.com/i/xxxxx",
 *   "payment_date": "2025-01-29T10:00:00Z"
 * }
 *
 * Réponse:
 * {
 *   "success": true,
 *   "revenue_id": 123,
 *   "project_id": 456,
 *   "amount": 99
 * }
 */
router.post('/stripe-payment', webhookController.handleStripePayment);

/**
 * POST /api/webhooks/stripe-payment-failed
 * Webhook pour enregistrer un échec de paiement
 * Appelé par WordPress après réception de invoice.payment_failed de Stripe
 *
 * Body attendu:
 * {
 *   "stripe_subscription_id": "sub_xxxxx",
 *   "stripe_invoice_id": "in_xxxxx",
 *   "amount": 99,
 *   "failure_reason": "Card declined",
 *   "next_retry_date": "2025-01-31T10:00:00Z"
 * }
 *
 * Réponse:
 * {
 *   "success": true,
 *   "revenue_id": 123,
 *   "project_id": 456,
 *   "alert": true
 * }
 */
router.post('/stripe-payment-failed', webhookController.handleStripePaymentFailed);

/**
 * POST /api/webhooks/stripe-cancel
 * Webhook pour enregistrer une annulation d'abonnement
 * Appelé par WordPress après réception de customer.subscription.deleted de Stripe
 *
 * Body attendu:
 * {
 *   "stripe_subscription_id": "sub_xxxxx",
 *   "cancellation_reason": "Client request",
 *   "canceled_at": "2025-01-29T10:00:00Z"
 * }
 *
 * Réponse:
 * {
 *   "success": true,
 *   "project_id": 456,
 *   "client_id": 123,
 *   "canceled_at": "2025-01-29T10:00:00Z"
 * }
 */
router.post('/stripe-cancel', webhookController.handleStripeCancel);

module.exports = router;
