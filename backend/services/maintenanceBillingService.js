// backend/services/maintenanceBillingService.js
//
// Prélèvement récurrent SEPA via Stripe pour les contrats de maintenance.
// Réutilise le client Stripe partagé (config/stripe.js) — aucune init parallèle.

const crypto = require('crypto');
const { getStripe } = require('../config/stripe');
const emailService = require('./emailService');

/**
 * Base publique du lien court de paiement. Le sous-domaine pay.pixfeed.net
 * proxy vers la même app : le lien est https://pay.pixfeed.net/{token} (sans /pay/).
 */
function payBaseUrl() {
  return (process.env.PAY_BASE_URL || 'https://pay.pixfeed.net').replace(/\/+$/, '');
}

/**
 * Garantit qu'un token public de paiement existe pour ce contrat (réutilisable),
 * et renvoie le lien court https://<base>/pay/:token.
 * Le token est aléatoire et non devinable (crypto.randomBytes).
 *
 * @param {object} db - app.locals.db
 * @param {number|string} contractId
 * @returns {Promise<{ token: string, url: string }>}
 */
async function ensurePayLink(db, contractId) {
  const { rows } = await db.pool.query(
    'SELECT id, billing_pay_token FROM maintenance_contracts WHERE id = $1',
    [contractId]
  );
  if (rows.length === 0) {
    const err = new Error('Contrat de maintenance introuvable.');
    err.statusCode = 404;
    throw err;
  }

  let token = rows[0].billing_pay_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex'); // 48 caractères hex, non devinable
    await db.pool.query(
      'UPDATE maintenance_contracts SET billing_pay_token = $1, updated_at = NOW() WHERE id = $2',
      [token, contractId]
    );
  }

  return { token, url: `${payBaseUrl()}/${token}` };
}

/**
 * Retrouve un contrat via son token public de paiement, puis crée une session
 * Checkout Stripe FRAÎCHE pour ce contrat. Utilisé par la route publique /pay/:token.
 *
 * @param {object} db - app.locals.db
 * @param {string} token
 * @returns {Promise<{ url: string }>} - URL Stripe Checkout fraîche
 */
async function createCheckoutByPayToken(db, token) {
  const { rows } = await db.pool.query(
    'SELECT id FROM maintenance_contracts WHERE billing_pay_token = $1',
    [token]
  );
  if (rows.length === 0) {
    const err = new Error('Lien de paiement inconnu.');
    err.statusCode = 404;
    throw err;
  }
  const { url } = await createCheckoutForContract(db, rows[0].id);
  return { url };
}

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
      const activeLike = obj.status === 'active' || obj.status === 'trialing';

      if (obj.cancel_at_period_end === true && activeLike) {
        // Résiliation programmée en fin de période
        const cancelAt = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;
        await db.pool.query(
          "UPDATE maintenance_contracts SET billing_status = 'canceling', billing_cancel_at = $1, stripe_subscription_id = COALESCE(stripe_subscription_id, $2), updated_at = NOW() WHERE id = $3",
          [cancelAt, obj.id, contract.id]
        );
        console.log(`[Billing] ${event.type} -> contrat ${contract.id} canceling (fin ${cancelAt})`);
      } else if (mapped) {
        // cancel_at_period_end=false ou statut non-actif : statut Stripe = source de vérité.
        // Retour en 'active' (resume) : on efface la date de résiliation prévue.
        const clearCancel = mapped === 'active';
        await db.pool.query(
          `UPDATE maintenance_contracts SET billing_status = $1, ${clearCancel ? 'billing_cancel_at = NULL, ' : ''}stripe_subscription_id = COALESCE(stripe_subscription_id, $2), updated_at = NOW() WHERE id = $3`,
          [mapped, obj.id, contract.id]
        );
        console.log(`[Billing] ${event.type} -> contrat ${contract.id} status=${obj.status} -> ${mapped}`);
      } else {
        // Statut non mappé : on stocke au moins l'id d'abonnement si absent
        await db.pool.query(
          "UPDATE maintenance_contracts SET stripe_subscription_id = COALESCE(stripe_subscription_id, $1), updated_at = NOW() WHERE id = $2",
          [obj.id, contract.id]
        );
        console.log(`[Billing] ${event.type} -> contrat ${contract.id} status=${obj.status} -> inchangé`);
      }
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

/**
 * Récupère le contrat + son stripe_subscription_id, ou throw (404/400).
 */
async function getContractWithSubscription(db, contractId) {
  const { rows } = await db.pool.query('SELECT * FROM maintenance_contracts WHERE id = $1', [contractId]);
  if (rows.length === 0) {
    const err = new Error('Contrat de maintenance introuvable.');
    err.statusCode = 404;
    throw err;
  }
  const contract = rows[0];
  if (!contract.stripe_subscription_id) {
    const err = new Error('Aucun abonnement actif pour ce contrat.');
    err.statusCode = 400;
    throw err;
  }
  return contract;
}

/**
 * Résilie l'abonnement Stripe d'un contrat.
 * - immediate=true  : annulation immédiate (billing_status='canceled').
 * - immediate=false : annulation en fin de période (billing_status='canceling').
 */
async function cancelSubscriptionForContract(db, contractId, { immediate = false } = {}) {
  const stripe = getStripe();
  const contract = await getContractWithSubscription(db, contractId);
  const subId = contract.stripe_subscription_id;

  if (immediate) {
    await stripe.subscriptions.cancel(subId);
    await db.pool.query(
      "UPDATE maintenance_contracts SET billing_status = 'canceled', billing_cancel_at = NOW(), updated_at = NOW() WHERE id = $1",
      [contract.id]
    );
    return { billing_status: 'canceled' };
  }

  const sub = await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
  const cancelAt = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  await db.pool.query(
    "UPDATE maintenance_contracts SET billing_status = 'canceling', billing_cancel_at = $1, updated_at = NOW() WHERE id = $2",
    [cancelAt, contract.id]
  );
  return { billing_status: 'canceling', billing_cancel_at: cancelAt };
}

/**
 * Réactive un abonnement dont la résiliation en fin de période était programmée.
 */
async function resumeSubscriptionForContract(db, contractId) {
  const stripe = getStripe();
  const contract = await getContractWithSubscription(db, contractId);
  await stripe.subscriptions.update(contract.stripe_subscription_id, { cancel_at_period_end: false });
  await db.pool.query(
    "UPDATE maintenance_contracts SET billing_status = 'active', billing_cancel_at = NULL, updated_at = NOW() WHERE id = $1",
    [contract.id]
  );
  return { billing_status: 'active' };
}

module.exports = {
  createCheckoutForContract,
  ensurePayLink,
  createCheckoutByPayToken,
  nextBillingAnchor,
  applyStripeEvent,
  cancelSubscriptionForContract,
  resumeSubscriptionForContract
};
