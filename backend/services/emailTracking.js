// backend/services/emailTracking.js
//
// Tracking des emails de prospection : ouvertures (pixel 1x1) et clics (redirection).
// À l'envoi : createTracking() crée une ligne + renvoie un token ; wrapHtml() injecte
// le pixel et réécrit les liens <a href> vers /api/track. Les hits sont comptés par
// backend/routes/trackRoutes.js. Aucune donnée personnelle dans l'URL (juste le token).

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

// Réécrit le HTML : liens <a href="http…"> -> redirection tracée, + pixel 1x1 en fin de corps.
function wrapHtml(html, token) {
  if (!token) return html;
  const base = baseUrl();
  let out = String(html || '');

  // Réécriture des liens absolus (http/https) uniquement — on ne touche pas aux mailto:/#.
  out = out.replace(/(<a\b[^>]*\bhref=)(["'])(https?:\/\/[^"']+)\2/gi, (m, pre, q, url) => {
    const tracked = `${base}/api/track/c/${token}?u=${encodeURIComponent(url)}`;
    return `${pre}${q}${tracked}${q}`;
  });

  // Pixel d'ouverture (invisible).
  const pixel = `<img src="${base}/api/track/o/${token}.gif" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${pixel}</body>`);
  else out += pixel;
  return out;
}

module.exports = { createTracking, wrapHtml, baseUrl };
