// backend/services/maintenanceBillingService.js
//
// Prélèvement récurrent SEPA via Stripe pour les contrats de maintenance.
// Réutilise le client Stripe partagé (config/stripe.js) — aucune init parallèle.

const { getStripe } = require('../config/stripe');

/**
 * Calcule le timestamp UNIX (secondes) de la prochaine occurrence du jour de
 * prélèvement (billing_day, borné 1..28). Si le jour est déjà passé ce mois-ci,
 * on prend le mois suivant.
 */
function nextBillingAnchor(billingDay) {
  const day = Math.min(Math.max(parseInt(billingDay, 10) || 1, 1), 28);
  const now = new Date();
  let anchor = new Date(now.getFullYear(), now.getMonth(), day, 0, 0, 0, 0);
  if (anchor.getTime() <= now.getTime()) {
    anchor = new Date(now.getFullYear(), now.getMonth() + 1, day, 0, 0, 0, 0);
  }
  return Math.floor(anchor.getTime() / 1000);
}

/**
 * Crée (ou réutilise) le Customer Stripe du contrat, puis une Checkout Session
 * d'abonnement SEPA mensuel. Passe le contrat en billing_status='pending'.
 *
 * @param {object} db - app.locals.db (accès via db.pool.query)
 * @param {number|string} contractId
 * @returns {Promise<{ url: string, sessionId: string }>}
 */
async function createCheckoutForContract(db, contractId) {
  const stripe = getStripe();

  // 1. Récupérer le contrat + le client lié
  const { rows } = await db.pool.query(
    `SELECT mc.*, c.name AS client_name, c.email AS client_email
     FROM maintenance_contracts mc
     LEFT JOIN crm_clients c ON mc.client_id = c.id
     WHERE mc.id = $1`,
    [contractId]
  );

  if (rows.length === 0) {
    const err = new Error('Contrat de maintenance introuvable.');
    err.statusCode = 404;
    throw err;
  }

  const contract = rows[0];

  if (!contract.client_email) {
    const err = new Error("Le client de ce contrat n'a pas d'adresse email : impossible de créer le prélèvement SEPA.");
    err.statusCode = 400;
    throw err;
  }

  const amount = Number(contract.monthly_amount);
  if (!amount || amount <= 0) {
    const err = new Error('Le montant mensuel du contrat doit être supérieur à 0 pour créer un prélèvement.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Créer ou réutiliser le Customer Stripe
  let customerId = contract.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: contract.client_email,
      name: contract.client_name || undefined,
      metadata: { maintenance_contract_id: String(contract.id) }
    });
    customerId = customer.id;
    await db.pool.query(
      'UPDATE maintenance_contracts SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
      [customerId, contract.id]
    );
  }

  // 3. Créer la Checkout Session (abonnement SEPA)
  const frontendUrl = process.env.FRONTEND_URL || 'https://crm.pixfeed.net';
  const anchor = nextBillingAnchor(contract.billing_day);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['sepa_debit'],
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(amount * 100),
          recurring: { interval: 'month' },
          product_data: {
            name: `Maintenance — ${contract.site_name || 'site'}`
          }
        }
      }
    ],
    subscription_data: {
      billing_cycle_anchor: anchor,
      proration_behavior: 'none',
      metadata: { maintenance_contract_id: String(contract.id) }
    },
    success_url: `${frontendUrl}/maintenance`,
    cancel_url: `${frontendUrl}/maintenance`,
    metadata: { maintenance_contract_id: String(contract.id) }
  });

  // 4. Marquer le contrat en attente de mise en place du prélèvement
  await db.pool.query(
    "UPDATE maintenance_contracts SET billing_status = 'pending', updated_at = NOW() WHERE id = $1",
    [contract.id]
  );

  return { url: session.url, sessionId: session.id };
}

module.exports = {
  createCheckoutForContract,
  nextBillingAnchor
};
