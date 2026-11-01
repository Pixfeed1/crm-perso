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
  return contractBillingAnchor(billingDay, null).anchor;
}

/**
 * Ancre Stripe d'un contrat de maintenance : première occurrence du jour de prélèvement
 * strictement après aujourd'hui ET après la date de début du contrat (midi UTC pour rester
 * dans la bonne journée quel que soit le fuseau du serveur).
 *
 * - Contrat déjà commencé : proration → le client paie à la signature la part du mois en
 *   cours jusqu'au jour de prélèvement, puis le montant complet chaque mois à ce jour.
 * - Contrat à démarrage futur : rien n'est dû avant le début, pas de proration ; première
 *   facture complète au premier jour de prélèvement suivant le début.
 *
 * @returns {{ anchor: number, prorate: boolean }}
 */
function contractBillingAnchor(billingDay, startDate) {
  const day = Math.min(Math.max(parseInt(billingDay, 10) || 1, 1), 28);
  const pad = (n) => String(n).padStart(2, '0');
  const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const nowSec = Math.floor(Date.now() / 1000);
  let startStr = null;
  if (startDate) {
    startStr = startDate instanceof Date ? toStr(startDate) : String(startDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) startStr = null;
  }
  const startSec = startStr ? Math.floor(Date.parse(`${startStr}T12:00:00Z`) / 1000) : null;
  const futureStart = startSec !== null && startSec > nowSec + 3600;

  // Point de départ : aujourd'hui, ou la date de début si elle est future.
  const from = futureStart ? new Date(Date.parse(`${startStr}T12:00:00Z`)) : new Date();
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  let anchor = Math.floor(Date.UTC(y, m, day, 12, 0, 0) / 1000);
  // Doit être strictement futur, et pas avant le début du contrat.
  while (anchor <= nowSec + 3600 || (startSec !== null && anchor < startSec)) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    anchor = Math.floor(Date.UTC(y, m, day, 12, 0, 0) / 1000);
  }
  return { anchor, prorate: !futureStart };
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

  // 3. Créer la Checkout Session (abonnement SEPA), ancrée sur le jour de prélèvement du contrat
  const frontendUrl = process.env.FRONTEND_URL || 'https://crm.pixfeed.net';
  const { anchor, prorate } = contractBillingAnchor(contract.billing_day, contract.contract_start_date);

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
      // Facturation alignée sur le jour de prélèvement (billing_day). Contrat en cours :
      // prorata du mois entamé dû à la signature ; contrat futur : rien avant le début.
      billing_cycle_anchor: anchor,
      proration_behavior: prorate ? 'create_prorations' : 'none',
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
 * Timestamp UNIX (secondes) de la date du premier prélèvement d'un abonnement, ou null
 * si elle est absente ou déjà passée (Stripe exige une ancre strictement future ; dans ce
 * cas la facturation démarre immédiatement, comme avant). Minuit Europe/Paris ≈ 00:00 UTC
 * + décalage : on prend midi UTC pour rester dans la bonne journée quel que soit le fuseau.
 */
function firstBillingAnchor(value) {
  if (!value) return null;
  // pg renvoie les DATE en objets Date à minuit LOCAL : on relit les composants locaux
  // (toISOString basculerait au jour précédent dès que le serveur est en UTC+N).
  const pad = (n) => String(n).padStart(2, '0');
  const str = value instanceof Date
    ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    : String(value).slice(0, 10);
  const ts = Date.parse(`${str}T12:00:00Z`);
  if (isNaN(ts)) return null;
  const seconds = Math.floor(ts / 1000);
  return seconds > Math.floor(Date.now() / 1000) + 3600 ? seconds : null;
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
  const billingCycleAnchor = firstBillingAnchor(sub.first_billing_date);

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
      metadata: { subscription_id: String(sub.id) },
      // Premier prélèvement différé : rien n'est dû à la validation (pas de prorata),
      // la première facture part à la date choisie puis à chaque date anniversaire.
      ...(billingCycleAnchor
        ? { billing_cycle_anchor: billingCycleAnchor, proration_behavior: 'none' }
        : {})
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
      // Mail de bienvenue au client, une seule fois (sans bloquer la réponse à Stripe). Chargé ici : évite un require circulaire.
      require('./bienvenueService').envoyer(db, table, row.id, { auto: true })
        .then((r) => { if (r && r.sentTo) console.log(`[Billing] mail de bienvenue envoyé (${tag}) à ${r.sentTo}`); })
        .catch((e) => console.error(`[Billing] mail de bienvenue non envoyé (${tag}) :`, e.message));
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
      // Stripe n'envoie pas les événements dans l'ordre : un « created » (statut incomplete) peut arriver
      // après le « updated » (active) et repasser la fiche en attente. On relit donc l'abonnement tel qu'il
      // est MAINTENANT chez Stripe plutôt que de se fier au contenu de l'événement.
      const synced = await appliquerAbonnementStripe(db, table, row, await relireAbonnement(obj), { bienvenue: true });
      console.log(`[Billing] ${event.type} -> ${tag} ${synced.detail}`);
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

/** L'abonnement tel qu'il est maintenant chez Stripe (repli : le contenu de l'événement). */
async function relireAbonnement(obj) {
  try { return await getStripe().subscriptions.retrieve(obj.id); } catch (e) {
    console.warn('[Billing] relecture abonnement Stripe impossible, contenu de l\'événement utilisé :', e.message);
    return obj;
  }
}

const finDePeriode = (sub) => {
  const t = sub.cancel_at || sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end);
  return t ? new Date(t * 1000).toISOString() : null;
};

/**
 * Applique le statut d'un abonnement Stripe (source de vérité) sur la fiche.
 * bienvenue=true (confirmation Stripe reçue en direct) : au passage à « actif », le mail de bienvenue part
 * (une seule fois, sans bloquer). Un rattrapage (resynchronisation) ne l'envoie pas : il se relit et
 * s'envoie depuis la fiche.
 */
async function appliquerAbonnementStripe(db, table, row, sub, { bienvenue = false } = {}) {
  const activeLike = sub.status === 'active' || sub.status === 'trialing';
  let statut = SUBSCRIPTION_STATUS_MAP[sub.status] || row.billing_status;
  let cancelAt = null;
  if ((sub.cancel_at_period_end === true || sub.cancel_at) && activeLike) { statut = 'canceling'; cancelAt = finDePeriode(sub); }
  await db.pool.query(
    `UPDATE ${table} SET billing_status = $1::varchar,
       billing_cancel_at = CASE WHEN $1::varchar = 'canceling' THEN $2::timestamp WHEN $1::varchar = 'active' THEN NULL ELSE billing_cancel_at END,
       stripe_subscription_id = $3,
       stripe_customer_id = COALESCE(stripe_customer_id, $4), updated_at = NOW() WHERE id = $5`,
    [statut, cancelAt, sub.id, typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null, row.id]
  );
  if (bienvenue && ['active', 'past_due', 'canceling'].includes(statut) && !['active', 'past_due', 'canceling'].includes(row.billing_status)) {
    require('./bienvenueService').envoyer(db, table, row.id, { auto: true })
      .then((r) => { if (r && r.sentTo) console.log(`[Billing] mail de bienvenue envoyé (${table} ${row.id}) à ${r.sentTo}`); })
      .catch((e) => console.error(`[Billing] mail de bienvenue non envoyé (${table} ${row.id}) :`, e.message));
  }
  return { billing_status: statut, billing_cancel_at: cancelAt, avant: row.billing_status, detail: `status=${sub.status} -> ${statut}` };
}

/**
 * Resynchronise une fiche avec Stripe (webhook manqué, ou événements dans le désordre).
 * Retrouve l'abonnement par son identifiant, sinon parmi ceux du client Stripe (métadonnées de la fiche).
 */
async function syncFromStripe(db, table, id) {
  const { rows } = await db.pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw Object.assign(new Error(table === 'subscriptions' ? 'Abonnement introuvable.' : 'Contrat de maintenance introuvable.'), { statusCode: 404 });
  const row = rows[0];
  const stripe = getStripe();
  let sub = null;
  if (row.stripe_subscription_id) sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id).catch(() => null);
  if (!sub && row.stripe_customer_id) {
    const cle = table === 'subscriptions' ? 'subscription_id' : 'maintenance_contract_id';
    const liste = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: 'all', limit: 20 });
    const candidats = liste.data.filter((x) => x.status !== 'incomplete_expired');
    sub = candidats.find((x) => x.metadata && String(x.metadata[cle]) === String(row.id)) || null;
  }
  if (!sub) return { billing_status: row.billing_status, trouve: false, avant: row.billing_status };
  return { ...(await appliquerAbonnementStripe(db, table, row, sub)), trouve: true };
}

/** Route Express : POST /:id/billing/sync (bouton « Vérifier auprès de Stripe »). */
function syncRoute(table) {
  return async (req, res) => {
    try { res.json({ success: true, ...(await syncFromStripe(req.app.locals.db, table, req.params.id)) }); } catch (e) {
      const code = e.statusCode || 500;
      if (code >= 500) console.error('[Billing] resynchronisation :', e.message);
      res.status(code).json({ message: code < 500 ? e.message : 'Stripe injoignable, réessayez dans un instant.' });
    }
  };
}

/**
 * Filet de sécurité si un webhook n'arrive pas : les fiches en attente (ou impayées) qui ont un client
 * Stripe sont relues chez Stripe. Lancé au démarrage puis toutes les 30 minutes (si Stripe est configuré).
 */
async function syncEnAttente(db) {
  let n = 0;
  for (const table of ['subscriptions', 'maintenance_contracts']) {
    const { rows } = await db.pool.query(
      `SELECT id FROM ${table} WHERE billing_status IN ('pending', 'past_due')
         AND (stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL)
         AND updated_at > NOW() - INTERVAL '90 days'`);
    for (const { id } of rows) {
      try {
        const r = await syncFromStripe(db, table, id);
        if (r.trouve && r.billing_status !== r.avant) { n++; console.log(`[Billing] resynchronisation ${table} ${id} : ${r.avant} -> ${r.billing_status}`); }
      } catch (e) { console.error(`[Billing] resynchronisation ${table} ${id} :`, e.message); }
    }
  }
  return n;
}

function startSyncEnAttente(db) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const tour = () => syncEnAttente(db).catch((e) => console.error('[Billing] resynchronisation :', e.message));
  setTimeout(tour, 60 * 1000).unref();
  return setInterval(tour, 30 * 60 * 1000).unref();
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
  contractBillingAnchor,
  firstBillingAnchor,
  applyStripeEvent,
  syncFromStripe,
  syncRoute,
  syncEnAttente,
  startSyncEnAttente,
  cancelSubscriptionForContract,
  resumeSubscriptionForContract,
  cancelSubscription,
  resumeSubscription
};
