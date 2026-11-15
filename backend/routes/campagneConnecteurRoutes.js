// Campagnes de prospection pour le connecteur MCP — monté sous /api/campagnes-connecteur, secret partagé
// OUTILS_MCP_SECRET seulement (l'interface garde /api/campagnes). Règles : services/campagneConnecteur.js.
const express = require('express');
const crypto = require('crypto');
const C = require('../services/campagneConnecteur');

const router = express.Router();
router.use((req, res, next) => {
  const attendu = process.env.OUTILS_MCP_SECRET || '';
  const recu = String(req.headers['x-outils-secret'] || '');
  if (attendu.length < 32 || recu.length !== attendu.length || !crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu))) return res.status(401).json({ message: 'secret du connecteur requis' });
  next();
});
const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, req.body || {})); }
  catch (e) {
    if (!e.status || e.status >= 500) console.error('[Campagnes / connecteur]', e.message);
    res.status(e.status || 500).json({ message: e.status ? e.message : `Campagnes : ${e.message}` });
  }
};
const ACTIONS = {
  lister: C.lister, lire: C.lire, ligne: C.ligne, prospects: C.prospects, crawls: C.crawls,
  creer: C.creer, modifier: C.modifier, ajouter: C.ajouter, 'modifier-ligne': C.modifierLigne, regenerer: C.regenerer,
  reanalyser: C.reanalyser, reprendre: C.reprendre, 'test-ab': C.testAb, piloter: C.piloter, boite: C.boiteReception,
};
for (const [chemin, fn] of Object.entries(ACTIONS)) router.post(`/${chemin}`, ok(fn));

module.exports = router;
