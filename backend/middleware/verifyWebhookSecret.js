// backend/middleware/verifyWebhookSecret.js
const crypto = require('crypto');

/**
 * Comparaison a temps constant de deux valeurs.
 * On hache d'abord en SHA-256 pour obtenir deux buffers de longueur fixe :
 * cela evite que crypto.timingSafeEqual ne leve une exception (longueurs
 * differentes) et ne divulgue la longueur du secret attendu.
 */
const safeCompare = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/**
 * Verifie l'en-tete HTTP "X-Webhook-Secret" contre process.env.WEBHOOK_SECRET.
 * - WEBHOOK_SECRET non defini cote serveur  -> 503 (jamais laisser passer sans secret)
 * - En-tete manquant ou ne correspondant pas -> 401 + log de la tentative
 */
const verifyWebhookSecret = (req, res, next) => {
  const expected = process.env.WEBHOOK_SECRET;

  // Ne jamais laisser passer une requete si le secret n'est pas configure cote serveur.
  if (!expected) {
    console.error('[WEBHOOK] WEBHOOK_SECRET non defini cote serveur - requete refusee');
    return res.status(503).json({ message: 'Service indisponible : secret webhook non configure' });
  }

  const provided = req.headers['x-webhook-secret'];

  if (!provided || !safeCompare(provided, expected)) {
    console.warn(
      `[WEBHOOK] Tentative non autorisee : ${req.method} ${req.originalUrl} depuis IP ${req.ip}`
    );
    return res.status(401).json({ message: 'Acces non autorise : secret webhook invalide' });
  }

  next();
};

module.exports = verifyWebhookSecret;
