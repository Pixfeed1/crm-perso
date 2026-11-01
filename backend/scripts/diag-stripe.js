/* Diagnostic des prélèvements Stripe : le CRM reçoit-il les notifications de Stripe ?
   N'affiche aucune clé ni secret (seulement « défini » ou non).
   Usage, depuis backend/ :  node scripts/diag-stripe.js            (constat seul)
                             node scripts/diag-stripe.js --corriger (aligne les fiches sur Stripe, sans envoyer de mail) */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const corriger = process.argv.includes('--corriger');
const d = (x) => (x ? new Date(x).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '-');

(async () => {
  const cle = process.env.STRIPE_SECRET_KEY || '';
  console.log(`Clé Stripe : ${cle ? (cle.startsWith('sk_live') || cle.startsWith('rk_live') ? 'définie (mode réel)' : 'définie (mode test)') : 'ABSENTE'}`);
  console.log(`Secret des notifications (STRIPE_WEBHOOK_SECRET) : ${process.env.STRIPE_WEBHOOK_SECRET ? 'défini' : 'ABSENT : Stripe ne peut pas prévenir le CRM'}`);

  if (cle) {
    try {
      const stripe = require('../config/stripe').getStripe();
      const eps = await stripe.webhookEndpoints.list({ limit: 20 });
      console.log(`\nAdresses de notification déclarées chez Stripe : ${eps.data.length}`);
      for (const e of eps.data) {
        const crm = /\/api\/maintenance-billing\/stripe-webhook$/.test(e.url);
        console.log(`  ${e.status === 'enabled' ? 'active  ' : 'INACTIVE'} ${e.url}${crm ? '  <- le CRM' : ''}`);
        if (crm) console.log(`           événements : ${e.enabled_events.join(', ')}`);
      }
      if (!eps.data.some((e) => /\/api\/maintenance-billing\/stripe-webhook$/.test(e.url))) {
        console.log('  AUCUNE ne pointe vers le CRM (…/api/maintenance-billing/stripe-webhook).');
      }
    } catch (e) { console.log(`\nLecture des adresses de notification impossible : ${e.message}`); }
  }

  // Événements des 20 derniers jours chez Stripe, croisés avec ce que le CRM a reçu.
  // « en échec chez Stripe » = nombre d'adresses de notification qui n'ont pas encore accepté l'événement.
  if (cle) {
    try {
      const stripe = require('../config/stripe').getStripe();
      const types = ['checkout.session.completed', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted'];
      const depuis = Math.floor(Date.now() / 1000) - 20 * 86400;
      const liste = await stripe.events.list({ types, created: { gte: depuis }, limit: 15 });
      const recus = new Set((await pool.query('SELECT event_id FROM stripe_webhook_events WHERE event_id = ANY($1)', [liste.data.map((e) => e.id)]).catch(() => ({ rows: [] }))).rows.map((r) => r.event_id));
      console.log(`\nÉvénements Stripe des 20 derniers jours (${liste.data.length}) :`);
      for (const e of liste.data) {
        console.log(`  ${d(e.created * 1000)}  ${e.type.padEnd(30)} reçu par le CRM : ${recus.has(e.id) ? 'oui' : 'NON'}   livraisons en échec chez Stripe : ${e.pending_webhooks}`);
      }
    } catch (e) { console.log(`\nLecture des événements Stripe impossible : ${e.message}`); }
  }

  const ev = await pool.query("SELECT type, received_at FROM stripe_webhook_events ORDER BY received_at DESC LIMIT 10").catch(() => ({ rows: [] }));
  console.log(`\nDernières notifications reçues par le CRM : ${ev.rows.length ? '' : 'AUCUNE'}`);
  for (const r of ev.rows) console.log(`  ${d(r.received_at)}  ${r.type}`);

  console.log('\nFiches en attente ou impayées :');
  const fiches = [
    ...(await pool.query("SELECT 'subscriptions' AS t, id, label AS nom, billing_status, stripe_customer_id, stripe_subscription_id FROM subscriptions WHERE billing_status IN ('pending','past_due') ORDER BY id")).rows,
    ...(await pool.query("SELECT 'maintenance_contracts' AS t, id, COALESCE(site_name, site_url) AS nom, billing_status, stripe_customer_id, stripe_subscription_id FROM maintenance_contracts WHERE billing_status IN ('pending','past_due') ORDER BY id")).rows
  ];
  if (!fiches.length) console.log('  aucune');
  let billing = null;
  if (corriger && cle) billing = require('../services/maintenanceBillingService');
  for (const f of fiches) {
    let suite = '';
    if (billing && (f.stripe_customer_id || f.stripe_subscription_id)) {
      try {
        const r = await billing.syncFromStripe({ pool }, f.t, f.id);
        suite = r.trouve ? `  -> d'après Stripe : ${r.billing_status}` : '  -> aucun abonnement chez Stripe (pas encore souscrit)';
      } catch (e) { suite = `  -> vérification impossible : ${e.message}`; }
    }
    console.log(`  ${f.t === 'subscriptions' ? 'abonnement' : 'contrat   '} ${f.id}  ${f.billing_status.padEnd(8)} ${f.nom || ''}${f.stripe_customer_id ? '' : '  (lien de paiement jamais ouvert)'}${suite}`);
  }
  if (!corriger && fiches.length) console.log('\nPour aligner ces fiches sur Stripe (aucun mail envoyé) : node scripts/diag-stripe.js --corriger');
  await pool.end();
})().catch(async (e) => { console.error('Erreur :', e.message); await pool.end().catch(() => {}); process.exit(1); });
