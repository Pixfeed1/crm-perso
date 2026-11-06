// Affaires (lot 5) : plusieurs par entreprise, prochaine action obligatoire, devis rattachables.
//   GET    /api/affaires?lead_id=…|client_id=…   liste d'une fiche
//   GET    /api/affaires/referentiel             types, étapes, motifs, canaux
//   POST   /api/affaires                         création
//   PUT    /api/affaires/:id                     modification (étape, montants, prochaine action…)
//   DELETE /api/affaires/:id                     suppression (devis détachés, relance fermée)
//   GET    /api/affaires/:id/devis-disponibles   devis rattachables
//   POST   /api/affaires/:id/devis { quote_id }  rattacher ; DELETE /api/affaires/:id/devis/:quoteId détacher
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const S = require('../services/affaireService');

router.use(authMiddleware);
const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, req)); }
  catch (e) { res.status(e.status || 500).json({ message: e.status ? e.message : `Affaire : ${e.message}` }); }
};

router.get('/referentiel', ok(async () => S.referentiel()));
router.get('/', ok((db, req) => S.lister(db, { lead_id: req.query.lead_id || null, client_id: req.query.client_id || null })));
router.post('/', ok((db, req) => S.creer(db, req.body || {})));
router.put('/:id', ok((db, req) => S.modifier(db, req.params.id, req.body || {})));
router.delete('/:id', ok((db, req) => S.supprimer(db, req.params.id)));
router.get('/:id/devis-disponibles', ok((db, req) => S.devisDisponibles(db, req.params.id)));
router.post('/:id/devis', ok((db, req) => S.rattacherDevis(db, req.params.id, (req.body || {}).quote_id)));
router.delete('/:id/devis/:quoteId', ok((db, req) => S.detacherDevis(db, req.params.id, req.params.quoteId)));

module.exports = router;
