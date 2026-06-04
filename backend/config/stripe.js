// backend/config/stripe.js
//
// Client Stripe partagé (init unique, lazy). Tout le code serveur DOIT passer par
// getStripe() pour réutiliser la même instance — pas d'init Stripe parallèle ailleurs.
// La clé secrète vient de l'environnement (STRIPE_SECRET_KEY) et n'est jamais exposée.

const Stripe = require('stripe');

let stripeClient = null;

/**
 * Retourne l'instance Stripe partagée.
 * @throws si STRIPE_SECRET_KEY n'est pas défini.
 */
function getStripe() {
  if (stripeClient) return stripeClient;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY non défini : configuration Stripe manquante côté serveur.');
  }

  stripeClient = new Stripe(key);
  return stripeClient;
}

module.exports = { getStripe };
