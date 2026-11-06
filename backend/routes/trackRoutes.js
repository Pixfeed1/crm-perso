// backend/routes/trackRoutes.js
//
// Routes PUBLIQUES (aucune auth) de tracking des emails de prospection.
//   GET /api/track/o/:token.gif  -> image vide pour les anciens emails (plus rien n'est compté)
//   GET /api/track/c/:token      -> clic (journalisé, filtré des robots, redirige vers un lien de l'email)
// Best-effort : toute erreur renvoie quand même le pixel / une redirection sûre,
// pour ne JAMAIS casser l'affichage de l'email chez le destinataire.

const express = require('express');
const router = express.Router();
const optout = require('../services/optout');

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

// Ancien pixel d'ouverture : les emails envoyés avant le lot 4 le contiennent encore. On renvoie
// l'image pour ne rien casser à l'affichage, sans rien compter ni enregistrer.
router.get('/o/:token', (req, res) => sendPixel(res));

// Clic : /api/track/c/:token?u=<url encodée> -> journalise puis redirige (lot 6).
// - Redirection SEULEMENT vers un lien présent dans l'email envoyé (liste enregistrée à l'envoi) ; jeton
//   inconnu ou lien étranger : pas de redirection (pas de redirection ouverte depuis le domaine du CRM).
//   Emails d'avant le lot 6 (liste absente) : tout lien http(s), si le jeton existe.
// - Chaque clic est journalisé (lien, catégorie, délai depuis l'envoi, navigateur annoncé ; pas d'adresse IP).
// - Clic probablement automatique (moins d'une minute après l'envoi, HEAD, service de sécurité connu,
//   rafale de liens différents en quelques secondes) : journalisé mais pas compté.
// - Le compteur click_count = clics d'avant le journal + clics humains journalisés.
const liensEmail = require('../utils/liensEmail');

router.get('/c/:token', async (req, res) => {
  const db = req.app.locals.db;
  const token = String(req.params.token || '');
  const target = req.query.u;
  let safe = null;
  try {
    if (target) {
      const u = new URL(target);
      if (u.protocol === 'http:' || u.protocol === 'https:') safe = u.href;
    }
  } catch { /* url invalide */ }

  let row = null;
  try {
    row = (await db.pool.query('SELECT id, contact_type, contact_id, subject, sent_at, liens FROM email_tracking WHERE token = $1', [token])).rows[0] || null;
  } catch (e) { console.error('[Tracking] clic (lecture) :', e.message); }
  const autorise = !!(row && safe && (!Array.isArray(row.liens) || row.liens.some((l) => { try { return new URL(l).href === safe; } catch { return false; } })));

  if (row && autorise) {
    try {
      const cat = liensEmail.categorie(safe);
      const delaiS = row.sent_at ? Math.round((Date.now() - new Date(row.sent_at).getTime()) / 1000) : null;
      const ua = String(req.get('user-agent') || '').slice(0, 300);
      let raison = liensEmail.raisonAutomatique({ ua, delaiS, methode: req.method });
      // Rafale : un autre lien de cet email cliqué il y a moins de RAFALE_S secondes -> filtre automatique.
      const voisins = (await db.pool.query(
        `SELECT id FROM email_clics WHERE tracking_id = $1 AND url <> $2 AND clique_le > NOW() - make_interval(secs => $3)`,
        [row.id, safe, liensEmail.RAFALE_S])).rows;
      if (!raison && voisins.length) raison = `${voisins.length + 1} liens différents ouverts en moins de ${liensEmail.RAFALE_S} s (vérification automatique probable)`;
      if (voisins.length) {
        await db.pool.query(`UPDATE email_clics SET automatique = TRUE, raison = COALESCE(raison, $2) WHERE id = ANY($1::int[]) AND automatique = FALSE`,
          [voisins.map((v) => v.id), `rafale de liens en moins de ${liensEmail.RAFALE_S} s`]);
      }
      const premierHumain = !raison && cat !== 'desinscription'
        && !(await db.pool.query("SELECT 1 FROM email_clics WHERE tracking_id = $1 AND automatique = FALSE AND categorie <> 'desinscription' LIMIT 1", [row.id])).rows.length;
      await db.pool.query(
        `INSERT INTO email_clics (tracking_id, url, categorie, delai_s, user_agent, automatique, raison) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, safe, cat, delaiS, ua || null, !!raison, raison]);
      // Compteurs : clics humains seulement (hors désinscription).
      await db.pool.query(
        `UPDATE email_tracking t SET
           click_count = COALESCE(t.clics_avant_journal, 0) + h.n,
           last_click_at = COALESCE(h.dernier, t.last_click_at),
           last_click_url = COALESCE(h.url, t.last_click_url)
         FROM (SELECT COUNT(*)::int AS n, MAX(clique_le) AS dernier,
                      (SELECT url FROM email_clics WHERE tracking_id = $1 AND automatique = FALSE AND categorie <> 'desinscription' ORDER BY clique_le DESC LIMIT 1) AS url
                 FROM email_clics WHERE tracking_id = $1 AND automatique = FALSE AND categorie <> 'desinscription') h
        WHERE t.id = $1`, [row.id]);
      // Premier clic humain d'un prospect : noté dans son historique (visible dans le Suivi).
      if (premierHumain && row.contact_type === 'lead' && row.contact_id) {
        await db.pool.query(
          `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done) VALUES ('lead', $1, 'note', NOW(), $2, TRUE)`,
          [row.contact_id, `📧 Lien cliqué : ${liensEmail.libelle(safe, cat)}${row.subject ? ` (email « ${row.subject} »)` : ''}`]).catch(() => {});
      }
    } catch (e) {
      console.error('[Tracking] clic :', e.message);
    }
    return res.redirect(302, safe);
  }
  res.status(404).set('Content-Type', 'text/html; charset=utf-8')
    .send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lien invalide</title></head><body style="font-family:Arial,sans-serif;padding:40px;color:#333">Ce lien n\'est pas valide ou a expiré.</body></html>');
});

// Désinscription RGPD : /api/track/u?e=<email>&t=<jeton signé> -> ajoute à la blocklist.
router.get('/u', async (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.query.e || '').trim().toLowerCase();
  const t = req.query.t;
  const page = (title, msg) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<style>body{font-family:Arial,Helvetica,sans-serif;background:#f4f5f8;color:#222;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}`
    + `.c{background:#fff;border-radius:14px;padding:32px 40px;max-width:420px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 10px}p{color:#555;line-height:1.5}</style></head>`
    + `<body><div class="c"><h1>${title}</h1><p>${msg}</p></div></body></html>`;
  if (!email || !optout.verify(email, t)) {
    return res.status(400).send(page('Lien invalide', 'Ce lien de désinscription n\'est pas valide.'));
  }
  try {
    await optout.addOptout(db, email, 'lien');
  } catch (e) {
    console.error('[Optout] add:', e.message);
    return res.status(500).send(page('Erreur', 'Une erreur est survenue, réessayez plus tard.'));
  }
  res.send(page('Vous êtes désinscrit', `L'adresse <b>${email}</b> ne recevra plus de messages de notre part. Merci.`));
});

module.exports = router;
