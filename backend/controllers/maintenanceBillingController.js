// backend/controllers/maintenanceBillingController.js
//
// Webhook Stripe pour le prélèvement de maintenance.
// - Vérifie la signature (corps brut requis).
// - Idempotence par event.id (table stripe_webhook_events).
// - Applique l'effet sur le contrat puis répond 2xx rapidement.

const { getStripe } = require('../config/stripe');
const maintenanceBillingService = require('../services/maintenanceBillingService');

const handleStripeWebhook = async (req, res) => {
  const db = req.app.locals.db;
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Billing Webhook] STRIPE_WEBHOOK_SECRET non défini côté serveur.');
    return res.status(503).json({ message: 'Webhook Stripe non configuré.' });
  }

  // 1. Vérification de la signature (req.body est un Buffer brut grâce à express.raw)
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.warn('[Billing Webhook] Signature invalide:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  // 2. Idempotence : on "réclame" l'event.id ; si déjà présent, on ne retraite pas.
  try {
    const claim = await db.pool.query(
      'INSERT INTO stripe_webhook_events (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
      [event.id, event.type]
    );
    if (claim.rowCount === 0) {
      return res.status(200).json({ received: true, duplicate: true });
    }
  } catch (e) {
    console.error('[Billing Webhook] Erreur idempotence (poursuite prudente):', e.message);
  }

  // 3. Traitement de l'événement (effets idempotents). On répond 2xx même en cas
  //    d'erreur de traitement (l'event est déjà enregistré) : l'erreur est loggée.
  try {
    await maintenanceBillingService.applyStripeEvent(db, event);
  } catch (e) {
    console.error('[Billing Webhook] Erreur traitement event', event.type, e);
  }

  return res.status(200).json({ received: true });
};

module.exports = { handleStripeWebhook };
