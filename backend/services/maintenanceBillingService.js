// backend/services/maintenanceBillingService.js
//
// Prélèvement récurrent SEPA via Stripe pour les contrats de maintenance.
// Réutilise le client Stripe partagé (config/stripe.js) — aucune init parallèle.

const { getStripe } = require('../config/stripe');
const emailService = require('./emailService');

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

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card', 'sepa_debit'],
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
      // Pas de billing_cycle_anchor : la facturation démarre immédiatement à la validation
      // du Checkout, puis se répète chaque mois à cette même date (proration par défaut).
      metadata: { maintenance_contract_id: String(contract.id) }
    },
    success_url: 'https://pixfeed.net/merci-maintenance',
    cancel_url: `${frontendUrl}/maintenance`,
    metadata: { maintenance_contract_id: String(contract.id) }
  });

  // 4. Marquer le contrat en attente de mise en place du prélèvement
  await db.pool.query(
    "UPDATE maintenance_contracts SET billing_status = 'pending', updated_at = NOW() WHERE id = $1",
    [contract.id]
  );

  return {
    url: session.url,
    sessionId: session.id,
    clientEmail: contract.client_email,
    clientName: contract.client_name
  };
}

/**
 * Retrouve un contrat de maintenance par metadata.maintenance_contract_id,
 * sinon par stripe_subscription_id, sinon par stripe_customer_id.
 */
async function findContract(db, { contractId, subscriptionId, customerId }) {
  if (contractId) {
    const r = await db.pool.query('SELECT * FROM maintenance_contracts WHERE id = $1', [contractId]);
    if (r.rows[0]) return r.rows[0];
  }
  if (subscriptionId) {
    const r = await db.pool.query('SELECT * FROM maintenance_contracts WHERE stripe_subscription_id = $1', [subscriptionId]);
    if (r.rows[0]) return r.rows[0];
  }
  if (customerId) {
    const r = await db.pool.query('SELECT * FROM maintenance_contracts WHERE stripe_customer_id = $1 ORDER BY id DESC LIMIT 1', [customerId]);
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

/**
 * Mappe le statut Stripe d'un abonnement (source de vérité) vers billing_status.
 */
const SUBSCRIPTION_STATUS_MAP = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete: 'pending',
  incomplete_expired: 'pending'
};

/**
 * Applique l'effet d'un événement Stripe (déjà vérifié + dédupliqué) sur le contrat.
 * Met à jour billing_status / stripe_subscription_id et alerte en cas d'échec.
 */
async function applyStripeEvent(db, event) {
  const obj = (event.data && event.data.object) || {};
  const contractId = obj.metadata && obj.metadata.maintenance_contract_id;
  const subscriptionId = obj.subscription || (obj.object === 'subscription' ? obj.id : null);
  const customerId = obj.customer || null;

  switch (event.type) {
    case 'checkout.session.completed': {
      const contract = await findContract(db, { contractId, customerId });
      if (!contract) return;
      await db.pool.query(
        "UPDATE maintenance_contracts SET stripe_subscription_id = COALESCE($1, stripe_subscription_id), billing_status = 'active', updated_at = NOW() WHERE id = $2",
        [obj.subscription || null, contract.id]
      );
      console.log(`[Billing] checkout.session.completed -> contrat ${contract.id} actif (sub ${obj.subscription || 'n/a'})`);
      break;
    }

    case 'invoice.paid': {
      const contract = await findContract(db, { contractId, subscriptionId, customerId });
      if (!contract) return;
      await db.pool.query(
        "UPDATE maintenance_contracts SET billing_status = 'active', updated_at = NOW() WHERE id = $1",
        [contract.id]
      );
      const paidAt = (obj.status_transitions && obj.status_transitions.paid_at)
        ? new Date(obj.status_transitions.paid_at * 1000).toISOString()
        : new Date().toISOString();
      console.log(`[Billing] invoice.paid -> contrat ${contract.id} (dernier paiement: ${paidAt})`);
      break;
    }

    case 'invoice.payment_failed': {
      const contract = await findContract(db, { contractId, subscriptionId, customerId });
      if (!contract) return;

      // Échec transitoire à ne PAS traiter comme un impayé :
      // - SCA/3DS en cours (authentication_required) avant validation du paiement ;
      // - nouvelle tentative déjà programmée par Stripe (dunning).
      const reasonCode =
        (obj.last_finalization_error && obj.last_finalization_error.code) ||
        (obj.last_payment_error && obj.last_payment_error.code) ||
        null;
      const retryImminent = !!obj.next_payment_attempt;
      if (reasonCode === 'authentication_required' || retryImminent) {
        console.log(`[Billing] invoice.payment_failed transitoire ignoré (contrat ${contract.id}) raison=${reasonCode || 'n/a'} retry=${retryImminent}`);
        break;
      }

      await db.pool.query(
        "UPDATE maintenance_contracts SET billing_status = 'past_due', updated_at = NOW() WHERE id = $1",
        [contract.id]
      );
      // Récupérer les infos client pour l'alerte
      const cr = await db.pool.query(
        `SELECT mc.site_name, c.name AS client_name, c.email AS client_email
         FROM maintenance_contracts mc LEFT JOIN crm_clients c ON mc.client_id = c.id
         WHERE mc.id = $1`,
        [contract.id]
      );
      const info = cr.rows[0] || {};
      try {
        await emailService.sendMaintenanceBillingFailedAlert({
          siteName: info.site_name || contract.site_name,
          clientName: info.client_name,
          clientEmail: info.client_email
        });
      } catch (e) {
        console.error('[Billing] Échec envoi alerte prélèvement:', e.message);
      }
      console.log(`[Billing] invoice.payment_failed -> contrat ${contract.id} en past_due`);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      // subscription.status est la SOURCE DE VÉRITÉ du statut de facturation
      const contract = await findContract(db, { contractId, subscriptionId: obj.id, customerId });
      if (!contract) return;
      const mapped = SUBSCRIPTION_STATUS_MAP[obj.status];
      if (mapped) {
        await db.pool.query(
          "UPDATE maintenance_contracts SET billing_status = $1, stripe_subscription_id = COALESCE(stripe_subscription_id, $2), updated_at = NOW() WHERE id = $3",
          [mapped, obj.id, contract.id]
        );
      } else {
        // Statut non mappé : on stocke au moins l'id d'abonnement si absent
        await db.pool.query(
          "UPDATE maintenance_contracts SET stripe_subscription_id = COALESCE(stripe_subscription_id, $1), updated_at = NOW() WHERE id = $2",
          [obj.id, contract.id]
        );
      }
      console.log(`[Billing] ${event.type} -> contrat ${contract.id} status=${obj.status} -> ${mapped || 'inchangé'}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const contract = await findContract(db, { contractId, subscriptionId: obj.id, customerId });
      if (!contract) return;
      await db.pool.query(
        "UPDATE maintenance_contracts SET billing_status = 'canceled', updated_at = NOW() WHERE id = $1",
        [contract.id]
      );
      console.log(`[Billing] customer.subscription.deleted -> contrat ${contract.id} canceled`);
      break;
    }

    default:
      // Événement non géré : ignoré.
      break;
  }
}

module.exports = {
  createCheckoutForContract,
  nextBillingAnchor,
  applyStripeEvent
};
