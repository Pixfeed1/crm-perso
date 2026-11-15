// Charte de rédaction et identité des sites — montée sous /api/charte. L'interface (session) et le connecteur MCP
// (secret partagé OUTILS_MCP_SECRET) passent par ici ; toutes les règles sont dans services/charteService.js.
//   GET  /                               sites qui ont une charte (version en cours)
//   GET  /:site                          version en cours, complète
//   GET  /:site/versions                 historique (date, auteur, motif, changements avec l'ancien texte)
//   GET  /:site/versions/:n              une version complète
//   GET  /:site/export.md                version en cours en Markdown (archives)
//   POST /:site/modifier { operations: [...], motif?, version_attendue?, simulation? (true par défaut) }
//   POST /:site/retour { version, motif?, simulation? }   nouvelle version qui reprend la version n
const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/authMiddleware');
const C = require('../services/charteService');

const router = express.Router();
function secretOk(req) {
  const attendu = process.env.OUTILS_MCP_SECRET || '';
  const recu = String(req.headers['x-outils-secret'] || '');
  if (attendu.length < 32 || recu.length !== attendu.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu));
}
router.use((req, res, next) => {
  if (secretOk(req)) { req.origineCharte = 'mcp'; req.auteurCharte = 'Claude (connecteur)'; return next(); }
  return authMiddleware(req, res, () => { req.origineCharte = 'interface'; req.auteurCharte = (req.user && req.user.username) || 'interface'; next(); });
});

const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, req.body || {}, req)); }
  catch (e) {
    if (!e.status || e.status >= 500) console.error('[Charte]', e.message);
    res.status(e.status || 500).json({ message: e.status ? e.message : `Charte : ${e.message}` });
  }
};
const site = (req) => {
  const n = Number(req.params.site);
  if (!Number.isInteger(n) || n <= 0) throw Object.assign(new Error('site : numéro attendu'), { status: 400 });
  return n;
};

router.get('/', ok(async (db) => ({ sites: await C.sitesAvecCharte(db) })));
router.get('/:site', ok(async (db, b, req) => {
  const c = await C.courante(db, site(req));
  if (!c) throw Object.assign(new Error(`aucune charte pour le site ${req.params.site}`), { status: 404 });
  return { ...c, libelles: { listes: C.LIBELLES_LISTES, effets: C.LIBELLES_EFFETS, listes_communes: C.LISTES_COMMUNES, listes_site: C.LISTES_SITE, listes_regex: C.LISTES_REGEX, effets_possibles: C.EFFETS } };
}));
router.get('/:site/versions', ok(async (db, b, req) => ({ versions: await C.versions(db, site(req)) })));
router.get('/:site/versions/:n', ok((db, b, req) => C.version(db, site(req), req.params.n)));
router.get('/:site/export.md', async (req, res) => {
  try {
    const c = await C.courante(req.app.locals.db, site(req));
    if (!c) return res.status(404).json({ message: 'aucune charte pour ce site' });
    const nom = `charte-${String(c.domain || `site-${c.site_id}`).replace(/[^a-z0-9.-]/gi, '')}-v${c.version}.md`;
    res.set('Content-Type', 'text/markdown; charset=utf-8').set('Content-Disposition', `attachment; filename="${nom}"`).send(C.exporterMarkdown(c));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});
router.post('/:site/modifier', ok((db, b, req) => C.modifier(db, {
  site: site(req), operations: b.operations, motif: b.motif, version_attendue: b.version_attendue,
  auteur: req.auteurCharte, origine: req.origineCharte, simulation: b.simulation !== false,
})));
router.post('/:site/retour', ok((db, b, req) => C.retour(db, {
  site: site(req), version: b.version, motif: b.motif, auteur: req.auteurCharte, origine: req.origineCharte, simulation: b.simulation !== false,
})));

module.exports = router;
