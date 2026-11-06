// backend/services/emailTracking.js
//
// Tracking des emails de prospection : CLICS seulement (redirection). Plus de pixel d'ouverture
// depuis le lot 4 (décision du 05/11/2026) : une ouverture n'est pas un signal fiable (images
// bloquées, préchargement des messageries) et c'est le traceur le plus intrusif.
// À l'envoi : createTracking() crée une ligne + renvoie un token ; wrapHtml() réécrit les liens
// <a href> vers /api/track. Les clics sont comptés par backend/routes/trackRoutes.js. Aucune donnée
// personnelle dans l'URL (juste le token).

const crypto = require('crypto');

// Base publique de l'app (pour construire les URLs de tracking). Surcharge via .env.
function baseUrl() {
  return (process.env.APP_BASE_URL || 'https://crm.pixfeed.net').replace(/\/+$/, '');
}

// Crée la ligne de tracking et renvoie son token (ou null si échec — l'envoi continue).
async function createTracking(db, { contact_type = 'lead', contact_id = null, to_email = null, subject = null }) {
  try {
    const token = crypto.randomBytes(24).toString('hex'); // 48 hex, opaque
    await db.pool.query(
      `INSERT INTO email_tracking (token, contact_type, contact_id, to_email, subject)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, contact_type, contact_id, to_email, subject]
    );
    return token;
  } catch (e) {
    console.error('[Tracking] createTracking:', e.message);
    return null;
  }
}

// Réécrit le HTML : liens <a href="http…"> -> redirection tracée. Aucun pixel.
function wrapHtml(html, token) {
  if (!token) return html;
  const base = baseUrl();
  let out = String(html || '');

  // Réécriture des liens absolus (http/https) uniquement — on ne touche pas aux mailto:/#.
  out = out.replace(/(<a\b[^>]*\bhref=)(["'])(https?:\/\/[^"']+)\2/gi, (m, pre, q, url) => {
    const tracked = `${base}/api/track/c/${token}?u=${encodeURIComponent(url.replace(/&amp;/g, '&'))}`;
    return `${pre}${q}${tracked}${q}`;
  });
  return out;
}

// Réécrit le HTML ET enregistre la liste des liens de l'email : la redirection de clic n'ira que vers
// eux (pas de redirection ouverte depuis le domaine du CRM).
async function tracer(db, html, token) {
  if (!token) return html;
  const liens = require('../utils/liensEmail').liensDe(html);
  await db.pool.query('UPDATE email_tracking SET liens = $2 WHERE token = $1', [token, JSON.stringify(liens)]).catch((e) => console.error('[Tracking] liens :', e.message));
  return wrapHtml(html, token);
}

module.exports = { createTracking, wrapHtml, tracer, baseUrl };
