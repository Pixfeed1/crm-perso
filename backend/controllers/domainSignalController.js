// backend/controllers/domainSignalController.js
// Signaux d'intention (nouveaux domaines .fr) : import, liste, contrôle, promotion, rejet.
const service = require('../services/domainSignalService');

const STATUTS = ['nouveau', 'a_surveiller', 'qualifie', 'promu', 'rejete'];
const intIds = (v) => (Array.isArray(v) ? v.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x)) : []);
const fail = (res, e, ctx) => {
  console.error(`[Signaux] ${ctx}:`, e.message);
  res.status(e.status || 500).json({ message: e.status ? e.message : 'Erreur serveur' });
};

module.exports = {
  // GET /api/portefeuille/signaux?statut=qualifie&limit=200 -> { counts, signals, busy }
  list: async (req, res) => {
    const db = req.app.locals.db;
    const statut = STATUTS.includes(req.query.statut) ? req.query.statut : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    try {
      const counts = await db.pool.query('SELECT statut, COUNT(*)::int AS n FROM domain_signals GROUP BY statut');
      const { rows } = await db.pool.query(
        `SELECT * FROM domain_signals ${statut ? 'WHERE statut = $2' : ''}
         ORDER BY intent_score DESC, detected_at DESC LIMIT $1`,
        statut ? [limit, statut] : [limit]
      );
      res.json({ counts: Object.fromEntries(counts.rows.map((r) => [r.statut, r.n])), signals: rows, busy: service.isBusy() });
    } catch (e) { fail(res, e, 'liste'); }
  },

  // GET /api/portefeuille/signaux/imports -> derniers imports (compteurs + progression)
  imports: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query('SELECT * FROM domain_signal_imports ORDER BY created_at DESC, id DESC LIMIT 20');
      res.json(rows);
    } catch (e) { fail(res, e, 'imports'); }
  },

  // POST /api/portefeuille/signaux/import { jour?: 'AAAA-MM-JJ', texte?: '...' } -> 201 { id }
  startImport: async (req, res) => {
    const db = req.app.locals.db;
    const { jour, texte } = req.body || {};
    try {
      const id = await service.startImport(db, { jour, texte });
      res.status(201).json({ id });
    } catch (e) { fail(res, e, 'import'); }
  },

  // POST /api/portefeuille/signaux/recheck { ids } -> { checked }
  recheck: async (req, res) => {
    const db = req.app.locals.db;
    const ids = intIds(req.body?.ids);
    if (ids.length === 0) return res.status(400).json({ message: 'Aucun signal sélectionné' });
    try {
      res.json(await service.recheckSignals(db, ids.slice(0, 200)));
    } catch (e) { fail(res, e, 'recheck'); }
  },

  // POST /api/portefeuille/signaux/promote { ids, relation_status?, note? } -> { created, lead_ids, skipped }
  promote: async (req, res) => {
    const db = req.app.locals.db;
    const ids = intIds(req.body?.ids);
    if (ids.length === 0) return res.status(400).json({ message: 'Aucun signal sélectionné' });
    try {
      res.json(await service.promote(db, ids, { relation_status: req.body?.relation_status, note: req.body?.note }));
    } catch (e) { fail(res, e, 'promote'); }
  },

  // POST /api/portefeuille/signaux/requalify -> { requalified } : recalcul score/statut sans réseau
  requalify: async (req, res) => {
    const db = req.app.locals.db;
    try { res.json(await service.requalify(db)); } catch (e) { fail(res, e, 'requalify'); }
  },

  // PATCH /api/portefeuille/signaux/:id { statut: 'rejete', raison? } | { notes }
  update: async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Identifiant invalide' });
    const { statut, raison, notes } = req.body || {};
    try {
      if (statut === 'rejete') await service.reject(db, id, raison);
      else if (statut === 'a_surveiller') await db.pool.query("UPDATE domain_signals SET statut = 'a_surveiller', raison_rejet = NULL, next_check_at = COALESCE(next_check_at, NOW() + INTERVAL '7 days'), updated_at = NOW() WHERE id = $1", [id]);
      else if (statut) return res.status(400).json({ message: 'Changement de statut non permis ici' });
      if (notes !== undefined) await db.pool.query('UPDATE domain_signals SET notes = $1, updated_at = NOW() WHERE id = $2', [String(notes || '').slice(0, 4000) || null, id]);
      const { rows } = await db.pool.query('SELECT * FROM domain_signals WHERE id = $1', [id]);
      if (!rows[0]) return res.status(404).json({ message: 'Signal introuvable' });
      res.json(rows[0]);
    } catch (e) { fail(res, e, 'update'); }
  }
};
