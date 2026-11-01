/* Répare les notifications Stripe -> CRM sans passer par le tableau de bord Stripe.
   La clé de signature d'une adresse existante ne peut pas être relue par l'API : on crée donc une
   nouvelle adresse (même URL, mêmes réglages, événements complétés), Stripe renvoie sa clé, elle est
   écrite dans backend/.env (copie de l'ancien dans .env.avant-whsec), puis l'ancienne adresse est
   DÉSACTIVÉE (pas supprimée : réactivable chez Stripe). Aucune clé n'est affichée.

   Usage, depuis backend/ :
     node scripts/reparer-webhook-stripe.js            répare
     node scripts/reparer-webhook-stripe.js --tester   après redémarrage du CRM : envoie une notification
                                                       de test signée avec la clé de .env, doit répondre 200 */
const fs = require('fs');
const path = require('path');
const ENV = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: ENV });

const URL_CRM = 'https://crm.pixfeed.net/api/maintenance-billing/stripe-webhook';
const EVENEMENTS = [
  'checkout.session.completed', 'invoice.paid', 'invoice.payment_failed',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'
];

function ecrireSecret(secret) {
  const avant = fs.readFileSync(ENV, 'utf8');
  fs.copyFileSync(ENV, ENV + '.avant-whsec');
  const lignes = avant.split(/\r?\n/).filter((l) => !/^\s*STRIPE_WEBHOOK_SECRET\s*=/.test(l));
  while (lignes.length && lignes[lignes.length - 1] === '') lignes.pop();
  lignes.push(`STRIPE_WEBHOOK_SECRET=${secret}`, '');
  fs.writeFileSync(ENV, lignes.join('\n'));   // même fichier : ses droits sont conservés
}

async function reparer() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY absente de backend/.env');
  const stripe = require('../config/stripe').getStripe();
  const anciennes = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter((e) => e.url === URL_CRM);
  const modele = anciennes.find((e) => e.status === 'enabled') || anciennes[0];

  const nouvelle = await stripe.webhookEndpoints.create({
    url: URL_CRM,
    enabled_events: EVENEMENTS,
    description: 'CRM PixFeed (prélèvements)',
    ...(modele && modele.api_version ? { api_version: modele.api_version } : {})
  });
  console.log(`Nouvelle adresse de notification créée chez Stripe (${nouvelle.id}), ${EVENEMENTS.length} événements.`);

  try {
    ecrireSecret(nouvelle.secret);
  } catch (e) {
    // .env illisible ou non modifiable : on retire la nouvelle adresse, rien n'a changé
    await stripe.webhookEndpoints.del(nouvelle.id).catch(() => {});
    throw new Error(`écriture de .env impossible (${e.message}) : rien n'a été modifié chez Stripe`);
  }
  console.log('Clé de signature écrite dans backend/.env (ancien fichier : backend/.env.avant-whsec).');

  for (const e of anciennes) {
    if (e.status === 'enabled') {
      await stripe.webhookEndpoints.update(e.id, { disabled: true });
      console.log(`Ancienne adresse désactivée chez Stripe (${e.id}). Elle reste réactivable.`);
    }
  }
  console.log('\nÀ faire maintenant : redémarrer le CRM pour qu\'il lise la nouvelle clé, puis tester :');
  console.log('  cd ~/crm.pixfeed.net && ./deploy.sh --force-all');
  console.log('  cd ~/crm.pixfeed.net/backend && node scripts/reparer-webhook-stripe.js --tester');
}

async function tester() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET absente de backend/.env');
  const Stripe = require('stripe');
  // événement sans effet : aucun abonnement visé, seulement enregistré comme reçu
  const payload = JSON.stringify({ id: `evt_test_crm_${Date.now()}`, object: 'event', type: 'crm.test', data: { object: {} } });
  const header = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_x').webhooks.generateTestHeaderString({ payload, secret });
  const r = await fetch(URL_CRM, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header }, body: payload });
  if (r.status === 200) console.log('OK : le CRM accepte les notifications signées avec la nouvelle clé (HTTP 200).');
  else if (r.status === 400) console.log('ÉCHEC (HTTP 400) : le CRM refuse la signature. A-t-il bien été redémarré après la réparation ?');
  else console.log(`ÉCHEC : HTTP ${r.status}`);
}

(process.argv.includes('--tester') ? tester() : reparer())
  .catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
