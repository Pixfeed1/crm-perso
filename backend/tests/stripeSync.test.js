// Statut du prélèvement aligné sur Stripe : événements reçus dans le désordre, webhook manqué
// (resynchronisation par l'identifiant de l'abonnement ou par le client Stripe), résiliation programmée.
// Stripe est simulé : aucun appel réel. Le mail de bienvenue n'est pas envoyé (fiches sans email).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

// abonnements Stripe simulés, chargés AVANT le service (qui garde une référence à getStripe)
const STRIPE = { subs: {} };
require('../config/stripe').getStripe = () => ({
  subscriptions: {
    retrieve: async (id) => { if (!STRIPE.subs[id]) throw new Error('No such subscription'); return STRIPE.subs[id]; },
    list: async ({ customer }) => ({ data: Object.values(STRIPE.subs).filter((s) => s.customer === customer) })
  }
});
const billing = require('../services/maintenanceBillingService');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };

async function base(pool) {
  for (const name of ['crm_clients', 'subscriptions', 'maintenance_contracts']) {
    const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${String(d).replace(/REFERENCES \w+\(id\)( ON DELETE \w+( \w+)?)?/, '')}`).join(', ');
    await pool.query(`CREATE TABLE ${name} (${cols})`);
  }
}
const statut = async (pool, table, id) => (await pool.query(`SELECT billing_status, billing_cancel_at, stripe_subscription_id FROM ${table} WHERE id = $1`, [id])).rows[0];

test('événements dans le désordre : un « created » (incomplete) arrivé après coup ne repasse pas la fiche en attente', opts, async () => {
  await withSchema('stripesync1', async ({ pool }) => {
    await base(pool);
    const db = { pool };
    const id = (await pool.query("INSERT INTO subscriptions (label, amount_eur, billing_status, stripe_customer_id) VALUES ('Maintenance - Support', 100, 'active', 'cus_A') RETURNING id")).rows[0].id;
    STRIPE.subs = { sub_A: { id: 'sub_A', customer: 'cus_A', status: 'active', metadata: { subscription_id: String(id) } } };
    // le contenu de l'événement est périmé (incomplete) ; Stripe dit « active » aujourd'hui
    await billing.applyStripeEvent(db, { type: 'customer.subscription.created', data: { object: { object: 'subscription', id: 'sub_A', customer: 'cus_A', status: 'incomplete', metadata: { subscription_id: String(id) } } } });
    assert.equal((await statut(pool, 'subscriptions', id)).billing_status, 'active');
  });
});

test('webhook manqué : la resynchronisation retrouve l’abonnement par le client Stripe et passe la fiche en actif', opts, async () => {
  await withSchema('stripesync2', async ({ pool }) => {
    await base(pool);
    const db = { pool };
    const id = (await pool.query("INSERT INTO maintenance_contracts (site_name, monthly_amount, billing_status, stripe_customer_id) VALUES ('landru.fr', 49, 'pending', 'cus_L') RETURNING id")).rows[0].id;
    STRIPE.subs = {
      sub_autre: { id: 'sub_autre', customer: 'cus_L', status: 'active', metadata: { maintenance_contract_id: '999' } },
      sub_L: { id: 'sub_L', customer: 'cus_L', status: 'active', metadata: { maintenance_contract_id: String(id) } }
    };
    const r = await billing.syncFromStripe(db, 'maintenance_contracts', id);
    assert.equal(r.trouve, true);
    assert.equal(r.avant, 'pending');
    const s = await statut(pool, 'maintenance_contracts', id);
    assert.equal(s.billing_status, 'active');
    assert.equal(s.stripe_subscription_id, 'sub_L', 'le bon abonnement, pas celui d’un autre contrat du même client');
  });
});

test('resynchronisation : résiliation programmée chez Stripe, puis abonnement introuvable (rien ne change)', opts, async () => {
  await withSchema('stripesync3', async ({ pool }) => {
    await base(pool);
    const db = { pool };
    const id = (await pool.query("INSERT INTO subscriptions (label, amount_eur, billing_status, stripe_subscription_id) VALUES ('Hébergement', 120, 'active', 'sub_C') RETURNING id")).rows[0].id;
    STRIPE.subs = { sub_C: { id: 'sub_C', customer: 'cus_C', status: 'active', cancel_at_period_end: true, current_period_end: 1798761600, metadata: {} } };
    await billing.syncFromStripe(db, 'subscriptions', id);
    const s = await statut(pool, 'subscriptions', id);
    assert.equal(s.billing_status, 'canceling');
    assert.ok(s.billing_cancel_at, 'date de fin renseignée');

    const id2 = (await pool.query("INSERT INTO subscriptions (label, amount_eur, billing_status) VALUES ('Sans Stripe', 10, 'pending') RETURNING id")).rows[0].id;
    const r = await billing.syncFromStripe(db, 'subscriptions', id2);
    assert.equal(r.trouve, false);
    assert.equal((await statut(pool, 'subscriptions', id2)).billing_status, 'pending');
  });
});
