// backend/routes/emailHistoryRoutes.js
//
// Historique GLOBAL des emails sortants : tous les envois de l'outil, quelle que
// soit leur origine (prospect, envoi rapide, devis, facture, rapport, relance…).
//
// Avant, chaque canal gardait sa trace dans son coin et un envoi differe non
// rattache a un prospect disparaissait completement une fois parti. Le journal
// email_log centralise tout ; on le croise ici avec le suivi d'ouverture pour
// afficher aussi qui a ouvert et clique.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Libellés lisibles des origines d'envoi (affichés tels quels côté interface).
const SOURCES = {
  prospect: 'Prospection',
  quick: 'Email rapide',
  relance: 'Relance',
  client: 'Client',
  devis: 'Devis',
  facture: 'Facture',
  rapport: 'Rapport maintenance',
  backlink: 'Backlink',
  systeme: 'Système',
  autre: 'Autre'
};

// GET /api/emails — liste paginée, filtrable par origine, statut ou destinataire.
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { source, status, q } = req.query;

  const where = [];
  const params = [];
  if (source && SOURCES[source]) { params.push(source); where.push(`l.source = $${params.length}`); }
  if (status === 'sent' || status === 'failed') { params.push(status); where.push(`l.status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(l.to_email ILIKE $${params.length} OR l.subject ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    // Le suivi d'ouverture est rattache par token quand il existe ; sinon on
    // retombe sur destinataire + sujet, ce qui couvre les envois plus anciens.
    const rows = await db.pool.query(
      `SELECT l.id, l.to_email, l.cc_email, l.bcc_email, l.subject, l.source,
              l.from_account, l.from_email, l.related_type, l.related_id,
              l.attachments_count, l.status, l.error_message, l.sent_at,
              t.open_count, t.first_open_at, t.click_count
         FROM email_log l
         LEFT JOIN email_tracking t
           ON (l.tracking_token IS NOT NULL AND t.token = l.tracking_token)
       ${whereSql}
        ORDER BY l.sent_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const total = await db.pool.query(`SELECT COUNT(*)::int AS n FROM email_log l ${whereSql}`, params);
    res.json({ emails: rows.rows, total: total.rows[0] ? total.rows[0].n : 0, sources: SOURCES });
  } catch (e) {
    console.error('[Emails] historique:', e.message);
    res.status(500).json({ message: "Impossible de charger l'historique des emails" });
  }
});

// GET /api/emails/stats — repartition par origine, pour les filtres.
router.get('/stats', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.pool.query(
      `SELECT source, COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS echecs
         FROM email_log GROUP BY source ORDER BY n DESC`
    );
    res.json({ par_source: r.rows, sources: SOURCES });
  } catch (e) {
    console.error('[Emails] stats:', e.message);
    res.status(500).json({ message: 'Impossible de charger les statistiques' });
  }
});

// GET /api/emails/:id — contenu complet, pour relire le message envoye.
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const r = await db.pool.query(
      `SELECT l.*, t.open_count, t.first_open_at, t.last_open_at, t.click_count, t.last_click_url
         FROM email_log l
         LEFT JOIN email_tracking t
           ON (l.tracking_token IS NOT NULL AND t.token = l.tracking_token)
        WHERE l.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ message: 'Email introuvable' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('[Emails] detail:', e.message);
    res.status(500).json({ message: "Impossible de charger l'email" });
  }
});

module.exports = router;
