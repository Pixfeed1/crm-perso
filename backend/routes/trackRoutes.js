// backend/routes/trackRoutes.js
//
// Routes PUBLIQUES (aucune auth) de tracking des emails de prospection.
//   GET /api/track/o/:token.gif  -> pixel d'ouverture (compte l'ouverture)
//   GET /api/track/c/:token      -> clic (compte + redirige vers ?u=<url>)
// Best-effort : toute erreur renvoie quand même le pixel / une redirection sûre,
// pour ne JAMAIS casser l'affichage de l'email chez le destinataire.

const express = require('express');
const router = express.Router();

// GIF transparent 1x1 (43 octets).
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function sendPixel(res) {
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.status(200).end(PIXEL);
}

// Ouverture : /api/track/o/:token(.gif) — on retire un éventuel suffixe .gif du param
// (robuste quelle que soit la version d'Express / path-to-regexp).
router.get('/o/:token', async (req, res) => {
  const db = req.app.locals.db;
  const token = String(req.params.token || '').replace(/\.gif$/i, '');
  try {
    const r = await db.pool.query(
      `UPDATE email_tracking
         SET open_count = open_count + 1,
             last_open_at = NOW(),
             first_open_at = COALESCE(first_open_at, NOW())
       WHERE token = $1
       RETURNING contact_type, contact_id, subject, open_count`,
      [token]
    );
    // Sur la PREMIÈRE ouverture d'un lead, on logge une interaction (visible dans le Suivi).
    const row = r.rows[0];
    if (row && row.contact_type === 'lead' && row.contact_id && row.open_count === 1) {
      await db.pool.query(
        `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done)
         VALUES ('lead', $1, 'email', NOW(), $2, TRUE)`,
        [row.contact_id, `📧 Email ouvert${row.subject ? ` : ${row.subject}` : ''}`]
      ).catch(() => {});
    }
  } catch (e) {
    console.error('[Tracking] open:', e.message);
  }
  sendPixel(res);
});

// Clic : /api/track/c/:token?u=<url encodée> -> compte puis redirige.
router.get('/c/:token', async (req, res) => {
  const db = req.app.locals.db;
  const token = req.params.token;
  const target = req.query.u;
  // Validation stricte de l'URL de destination (uniquement http/https) — anti open-redirect.
  let safe = null;
  try {
    if (target) {
      const u = new URL(target);
      if (u.protocol === 'http:' || u.protocol === 'https:') safe = u.href;
    }
  } catch { /* url invalide */ }

  try {
    await db.pool.query(
      `UPDATE email_tracking
         SET click_count = click_count + 1, last_click_at = NOW(), last_click_url = $2,
             open_count = GREATEST(open_count, 1), first_open_at = COALESCE(first_open_at, NOW())
       WHERE token = $1`,
      [token, safe]
    );
  } catch (e) {
    console.error('[Tracking] click:', e.message);
  }

  if (safe) return res.redirect(302, safe);
  res.status(204).end();
});

module.exports = router;
