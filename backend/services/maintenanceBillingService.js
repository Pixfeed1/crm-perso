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
async function ensurePayLinkFor(db, table, id, notFoundMsg) {
  const { rows } = await db.pool.query(
    `SELECT id, billing_pay_token FROM ${table} WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) {
    const err = new Error(notFoundMsg);
    err.statusCode = 404;
    throw err;
  }

  let token = rows[0].billing_pay_token;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex'); // 48 caractères hex, non devinable
    await db.pool.query(
      `UPDATE ${table} SET billing_pay_token = $1, updated_at = NOW() WHERE id = $2`,
      [token, id]
    );
  }

  return { token, url: `${payBaseUrl()}/${token}` };
}

// Lien court d'un contrat de maintenance.
async function ensurePayLink(db, contractId) {
  return ensurePayLinkFor(db, 'maintenance_contracts', contractId, 'Contrat de maintenance introuvable.');
}

// Lien court d'un abonnement libre.
async function ensureSubscriptionPayLink(db, subscriptionId) {
  return ensurePayLinkFor(db, 'subscriptions', subscriptionId, 'Abonnement introuvable.');
}

/**
 * Retrouve l'entité (contrat de maintenance OU abonnement) via son token public,
 * puis crée une session Checkout Stripe FRAÎCHE. Route publique /pay/:token et /:token.
 * Cherche d'ABORD dans maintenance_contracts, sinon dans subscriptions.
 *
 * @param {object} db - app.locals.db
 * @param {string} token
 * @returns {Promise<{ url: string }>} - URL Stripe Checkout fraîche
 */
async function createCheckoutByPayToken(db, token) {
  const mc = await db.pool.query(
    'SELECT id FROM maintenance_contracts WHERE billing_pay_token = $1',
    [token]
  );
  if (mc.rows.length > 0) {
    const { url } = await createCheckoutForContract(db, mc.rows[0].id);
    return { url };
  }

  const sub = await db.pool.query(
    'SELECT id FROM subscriptions WHERE billing_pay_token = $1',
    [token]
  );
  if (sub.rows.length > 0) {
    const { url } = await createCheckoutForSubscription(db, sub.rows[0].id);
    return { url };
  }

  const err = new Error('Lien de paiement inconnu.');
  err.statusCode = 404;
  throw err;
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
 * Crée (ou réutilise) le Customer Stripe d'un abonnement libre, puis une Checkout
 * Session d'abonnement récurrent (price_data EUR dynamique). Passe billing_status='pending'.
 * metadata.subscription_id différencie des contrats de maintenance dans le webhook.
 *
 * @param {object} db - app.locals.db
 * @param {number|string} subscriptionId
 * @returns {Promise<{ url, sessionId, clientEmail, clientName }>}
 */
async function createCheckoutForSubscription(db, subscriptionId) {
  const stripe = getStripe();

  const { rows } = await db.pool.query(
    `SELECT s.*, c.name AS client_name, c.email AS client_email
     FROM subscriptions s
     LEFT JOIN crm_clients c ON s.client_id = c.id
     WHERE s.id = $1`,
    [subscriptionId]
  );

  if (rows.length === 0) {
    const err = new Error('Abonnement introuvable.');
    err.statusCode = 404;
    throw err;
  }

  const sub = rows[0];

  if (!sub.client_email) {
    const err = new Error("Le client de cet abonnement n'a pas d'adresse email : impossible de créer le paiement.");
    err.statusCode = 400;
    throw err;
  }

  const amount = Number(sub.amount_eur);
  if (!amount || amount <= 0) {
    const err = new Error("Le montant de l'abonnement doit être supérieur à 0.");
    err.statusCode = 400;
    throw err;
  }

  const interval = sub.billing_interval === 'year' ? 'year' : 'month';
  const intervalCount = Math.max(parseInt(sub.interval_count, 10) || 1, 1);

  // Customer Stripe (créé ou réutilisé)
  let customerId = sub.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: sub.client_email,
      name: sub.client_name || undefined,
      metadata: { subscription_id: String(sub.id) }
    });
    customerId = customer.id;
    await db.pool.query(
      'UPDATE subscriptions SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
      [customerId, sub.id]
    );
  }

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
          recurring: { interval, interval_count: intervalCount },
          product_data: { name: sub.label || 'Abonnement' }
        }
      }
    ],
    subscription_data: {
      metadata: { subscription_id: String(sub.id) }
    },
    success_url: 'https://pixfeed.net/merci-abonnement',
    cancel_url: `${frontendUrl}/invoices`,
    metadata: { subscription_id: String(sub.id) }
  });

  await db.pool.query(
    "UPDATE subscriptions SET billing_status = 'pending', updated_at = NOW() WHERE id = $1",
    [sub.id]
  );

  return {
    url: session.url,
    sessionId: session.id,
    clientEmail: sub.client_email,
    clientName: sub.client_name
  };
}

/**
 * Résout l'entité de facturation visée par un objet Stripe, à travers les DEUX
 * tables (maintenance_contracts et subscriptions). Retourne { table, row } ou null.
 * Priorité : metadata explicite -> stripe_subscription_id -> stripe_customer_id.
 */
async function resolveBillingTarget(db, obj) {
  const md = obj.metadata || {};
  const stripeSubId = obj.subscription || (obj.object === 'subscription' ? obj.id : null);
  const customerId = obj.customer || null;

  // 1. metadata explicite (différencie maintenance vs abonnement libre)
  if (md.maintenance_contract_id) {
    const r = await db.pool.query('SELECT * FROM maintenance_contracts WHERE id = $1', [md.maintenance_contract_id]);
    if (r.rows[0]) return { table: 'maintenance_contracts', row: r.rows[0] };
  }
  if (md.subscription_id) {
    const r = await db.pool.query('SELECT * FROM subscriptions WHERE id = $1', [md.subscription_id]);
    if (r.rows[0]) return { table: 'subscriptions', row: r.rows[0] };
  }

  // 2. par stripe_subscription_id (cherche dans les deux tables)
  if (stripeSubId) {
    let r = await db.pool.query('SELECT * FROM maintenance_contracts WHERE stripe_subscription_id = $1', [stripeSubId]);
    if (r.rows[0]) return { table: 'maintenance_contracts', row: r.rows[0] };
    r = await db.pool.query('SELECT * FROM subscriptions WHERE stripe_subscription_id = $1', [stripeSubId]);
    if (r.rows[0]) return { table: 'subscriptions', row: r.rows[0] };
  }

  // 3. par stripe_customer_id (dernier recours)
  if (customerId) {
    let r = await db.pool.query('SELECT * FROM maintenance_contracts WHERE stripe_customer_id = $1 ORDER BY id DESC LIMIT 1', [customerId]);
    if (r.rows[0]) return { table: 'maintenance_contracts', row: r.rows[0] };
    r = await db.pool.query('SELECT * FROM subscriptions WHERE stripe_customer_id = $1 ORDER BY id DESC LIMIT 1', [customerId]);
    if (r.rows[0]) return { table: 'subscriptions', row: r.rows[0] };
  }

  return null;
}

// Libellé d'affichage pour les logs/alertes selon le type d'entité.
function targetLabel(table, row) {
  return table === 'maintenance_contracts' ? (row.site_name || 'maintenance') : (row.label || 'abonnement');
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
 * Applique l'effet d'un événement Stripe (déjà vérifié + dédupliqué) sur l'entité
 * de facturation visée (contrat de maintenance OU abonnement libre). Même mapping de
 * statut pour les deux : la table cible est résolue dynamiquement.
 */
async function applyStripeEvent(db, event) {
  const obj = (event.data && event.data.object) || {};

  const target = await resolveBillingTarget(db, obj);
  if (!target) return;
  const { table, row } = target;
  const tag = `${table === 'subscriptions' ? 'abonnement' : 'contrat'} ${row.id}`;

  switch (event.type) {
    case 'checkout.session.completed': {
      await db.pool.query(
        `UPDATE ${table} SET stripe_subscription_id = COALESCE($1, stripe_subscription_id), billing_status = 'active', updated_at = NOW() WHERE id = $2`,
        [obj.subscription || null, row.id]
      );
      console.log(`[Billing] checkout.session.completed -> ${tag} actif (sub ${obj.subscription || 'n/a'})`);
      break;
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      // Paiement réussi : (re)passe en actif et efface tout "Impayé" résiduel.
      await db.pool.query(
        `UPDATE ${table} SET billing_status = 'active', updated_at = NOW()
         WHERE id = $1 AND billing_status NOT IN ('canceling', 'canceled')`,
        [row.id]
      );
      // Enregistre l'encaissement récurrent dans revenues (alimente le CA réalisé).
      // Idempotent par stripe_invoice_id : ne crée jamais de doublon, ne touche pas l'abonnement.
      try {
        const stripeInvoiceId = obj.id || null;
        const amountEur = typeof obj.amount_paid === 'number' ? obj.amount_paid / 100
          : (typeof obj.total === 'number' ? obj.total / 100 : null);
        if (stripeInvoiceId && amountEur && amountEur > 0) {
          const dup = await db.pool.query('SELECT id FROM revenues WHERE stripe_invoice_id = $1 LIMIT 1', [stripeInvoiceId]);
          if (dup.rows.length === 0) {
            await db.pool.query(
              `INSERT INTO revenues (amount, date, description, type, status, client_id, stripe_invoice_id, created_at, updated_at)
               VALUES ($1, CURRENT_DATE, $2, 'subscription', 'paid', $3, $4, NOW(), NOW())`,
              [amountEur, `Encaissement ${targetLabel(table, row)}`, row.client_id || null, stripeInvoiceId]
            );
          }
        }
      } catch (revErr) {
        console.error(`[Billing] Échec enregistrement revenu invoice.paid (${tag}):`, revErr.message);
      }
      console.log(`[Billing] ${event.type} -> ${tag} actif`);
      break;
    }

    case 'invoice.payment_failed': {
      const billingReason = obj.billing_reason || null;
      // Échec transitoire à ne PAS traiter comme un impayé :
      // - SCA/3DS en cours (authentication_required) avant validation du paiement ;
      // - nouvelle tentative déjà programmée par Stripe (dunning).
      const reasonCode =
        (obj.last_finalization_error && obj.last_finalization_error.code) ||
        (obj.last_payment_error && obj.last_payment_error.code) ||
        null;
      const retryImminent = !!obj.next_payment_attempt;

      // 1) Échec de MISE EN PLACE (1re facture, avant que le client ait fini le Checkout
      //    et rattaché sa carte) : billing_reason='subscription_create' (abonnement encore
      //    incomplete, aucun paiement réussi). On IGNORE (log seulement), pas d'alerte.
      if (billingReason === 'subscription_create' || reasonCode === 'authentication_required' || retryImminent) {
        console.log(`[Billing] invoice.payment_failed initial/transitoire ignoré (${tag}) reason=${billingReason || 'n/a'} code=${reasonCode || 'n/a'} retry=${retryImminent}`);
        break;
      }

      // 2) On n'alerte + ne passe en "Impayé" QUE pour un vrai échec de RENOUVELLEMENT
      //    d'un abonnement déjà actif (billing_reason='subscription_cycle').
      if (billingReason !== 'subscription_cycle') {
        console.log(`[Billing] invoice.payment_failed non-cycle ignoré (${tag}) reason=${billingReason || 'n/a'}`);
        break;
      }

      await db.pool.query(
        `UPDATE ${table} SET billing_status = 'past_due', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      // Récupérer les infos client pour l'alerte interne
      const cr = await db.pool.query(
        `SELECT c.name AS client_name, c.email AS client_email
         FROM ${table} t LEFT JOIN crm_clients c ON t.client_id = c.id
         WHERE t.id = $1`,
        [row.id]
      );
      const info = cr.rows[0] || {};
      try {
        await emailService.sendMaintenanceBillingFailedAlert({
          siteName: targetLabel(table, row),
          clientName: info.client_name,
          clientEmail: info.client_email
        });
      } catch (e) {
        console.error('[Billing] Échec envoi alerte paiement:', e.message);
      }
      console.log(`[Billing] invoice.payment_failed -> ${tag} en past_due`);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      // subscription.status est la SOURCE DE VÉRITÉ du statut de facturation
      const mapped = SUBSCRIPTION_STATUS_MAP[obj.status];
      const activeLike = obj.status === 'active' || obj.status === 'trialing';

      if (obj.cancel_at_period_end === true && activeLike) {
        const cancelAt = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;
        await db.pool.query(
          `UPDATE ${table} SET billing_status = 'canceling', billing_cancel_at = $1, stripe_subscription_id = COALESCE(stripe_subscription_id, $2), updated_at = NOW() WHERE id = $3`,
          [cancelAt, obj.id, row.id]
        );
        console.log(`[Billing] ${event.type} -> ${tag} canceling (fin ${cancelAt})`);
      } else if (mapped) {
        const clearCancel = mapped === 'active';
        await db.pool.query(
          `UPDATE ${table} SET billing_status = $1, ${clearCancel ? 'billing_cancel_at = NULL, ' : ''}stripe_subscription_id = COALESCE(stripe_subscription_id, $2), updated_at = NOW() WHERE id = $3`,
          [mapped, obj.id, row.id]
        );
        console.log(`[Billing] ${event.type} -> ${tag} status=${obj.status} -> ${mapped}`);
      } else {
        await db.pool.query(
          `UPDATE ${table} SET stripe_subscription_id = COALESCE(stripe_subscription_id, $1), updated_at = NOW() WHERE id = $2`,
          [obj.id, row.id]
        );
        console.log(`[Billing] ${event.type} -> ${tag} status=${obj.status} -> inchangé`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      await db.pool.query(
        `UPDATE ${table} SET billing_status = 'canceled', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      console.log(`[Billing] customer.subscription.deleted -> ${tag} canceled`);
      break;
    }

    default:
      // Événement non géré : ignoré.
      break;
  }
}

/**
 * Récupère une ligne (table générique) + son stripe_subscription_id, ou throw (404/400).
 */
async function getRowWithStripeSub(db, table, id, notFoundMsg) {
  const { rows } = await db.pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (rows.length === 0) {
    const err = new Error(notFoundMsg);
    err.statusCode = 404;
    throw err;
  }
  const row = rows[0];
  if (!row.stripe_subscription_id) {
    const err = new Error('Aucun abonnement actif pour cet élément.');
    err.statusCode = 400;
    throw err;
  }
  return row;
}

/**
 * Résilie l'abonnement Stripe d'une ligne (maintenance ou abonnement libre).
 * - immediate=true  : annulation immédiate (billing_status='canceled').
 * - immediate=false : annulation en fin de période (billing_status='canceling').
 */
async function cancelStripeSubRow(db, table, id, { immediate = false } = {}, notFoundMsg) {
  const stripe = getStripe();
  const row = await getRowWithStripeSub(db, table, id, notFoundMsg);
  const subId = row.stripe_subscription_id;

  if (immediate) {
    await stripe.subscriptions.cancel(subId);
    await db.pool.query(
      `UPDATE ${table} SET billing_status = 'canceled', billing_cancel_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [row.id]
    );
    return { billing_status: 'canceled' };
  }

  const sub = await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
  const cancelAt = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  await db.pool.query(
    `UPDATE ${table} SET billing_status = 'canceling', billing_cancel_at = $1, updated_at = NOW() WHERE id = $2`,
    [cancelAt, row.id]
  );
  return { billing_status: 'canceling', billing_cancel_at: cancelAt };
}

/**
 * Réactive un abonnement Stripe dont la résiliation en fin de période était programmée.
 */
async function resumeStripeSubRow(db, table, id, notFoundMsg) {
  const stripe = getStripe();
  const row = await getRowWithStripeSub(db, table, id, notFoundMsg);
  await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: false });
  await db.pool.query(
    `UPDATE ${table} SET billing_status = 'active', billing_cancel_at = NULL, updated_at = NOW() WHERE id = $1`,
    [row.id]
  );
  return { billing_status: 'active' };
}

// --- Wrappers maintenance (comportement inchangé) ---
function cancelSubscriptionForContract(db, contractId, opts = {}) {
  return cancelStripeSubRow(db, 'maintenance_contracts', contractId, opts, 'Contrat de maintenance introuvable.');
}
function resumeSubscriptionForContract(db, contractId) {
  return resumeStripeSubRow(db, 'maintenance_contracts', contractId, 'Contrat de maintenance introuvable.');
}

// --- Wrappers abonnements libres ---
function cancelSubscription(db, subscriptionId, opts = {}) {
  return cancelStripeSubRow(db, 'subscriptions', subscriptionId, opts, 'Abonnement introuvable.');
}
function resumeSubscription(db, subscriptionId) {
  return resumeStripeSubRow(db, 'subscriptions', subscriptionId, 'Abonnement introuvable.');
}

module.exports = {
  createCheckoutForContract,
  createCheckoutForSubscription,
  ensurePayLink,
  ensureSubscriptionPayLink,
  createCheckoutByPayToken,
  nextBillingAnchor,
  applyStripeEvent,
  cancelSubscriptionForContract,
  resumeSubscriptionForContract,
  cancelSubscription,
  resumeSubscription
};
