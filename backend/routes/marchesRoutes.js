// Veille des marchés publics (BOAMP) — monté sous /api/portefeuille/marches (session).
//   GET  /                     liste (theme, statut, cible=pertinent|hors_cible|tous, ouverts=0|1, departement)
//   POST /relever              relevé tout de suite, en arrière-plan
//   PUT  /reglages             { montant_max, departements, exclusions, alerte_mail }
//   PUT  /:idweb               { statut, note } : suivi (à étudier, je réponds, répondu, gagné, perdu, écarté)
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const M = require('../services/marchesService');

const router = express.Router();
router.use(authMiddleware);
const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, req.body || {}, req)); }
  catch (e) {
    if (!e.status || e.status >= 500) console.error('[Marchés]', e.message);
    res.status(e.status || 500).json({ message: e.message });
  }
};
router.get('/', ok((db, b, req) => M.lister(db, { theme: req.query.theme || null, statut: req.query.statut || null, cible: req.query.cible || 'pertinent', ouverts: req.query.ouverts !== '0', departement: req.query.departement || null })));
router.post('/relever', ok(async (db) => M.lancer(db)));
router.put('/reglages', ok((db, b) => M.regler(db, b)));
router.put('/:idweb', ok((db, b, req) => M.suivre(db, req.params.idweb, { statut: b.statut, note: b.note })));

module.exports = router;
