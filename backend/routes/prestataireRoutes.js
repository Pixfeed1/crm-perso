// Signal « prestataire en difficulté ou disparu » — monté sous /api/portefeuille/prestataires (session).
//   GET  /                         liste (gravite_min=1 par défaut, statut, avec_ignores)
//   GET  /etat                     vérification complète en cours ?
//   POST /verifier { domaine? }    un prestataire tout de suite, ou toute la liste en arrière-plan
//   GET  /:domaine                 détail, preuves, sites clients
//   POST /:domaine/prospects       les sites clients deviennent des prospects
//   POST /:domaine/campagne { campagne_id }   ajoutés à une campagne (préparée, jamais envoyée)
//   POST /:domaine/fiche           fiche du prestataire lui-même (reprise de portefeuille)
//   POST /:domaine/ignorer { raison?, retablir? }
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const P = require('../services/prestataireService');

const router = express.Router();
router.use(authMiddleware);
const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, req.body || {}, req)); }
  catch (e) {
    if (!e.status || e.status >= 500) console.error('[Prestataires]', e.message);
    res.status(e.status || 500).json({ message: e.message });
  }
};
router.get('/', ok((db, b, req) => P.lister(db, { gravite_min: req.query.gravite_min ?? 1, statut: req.query.statut || null, avec_ignores: req.query.avec_ignores === '1' })));
router.get('/etat', ok(async () => P.etat()));
router.post('/verifier', ok(async (db, b) => (b.domaine ? P.verifier(db, { domaines: [b.domaine] }) : P.lancer(db))));
router.get('/:domaine', ok((db, b, req) => P.detail(db, req.params.domaine)));
router.post('/:domaine/prospects', ok((db, b, req) => P.promouvoir(db, req.params.domaine, { result_ids: Array.isArray(b.result_ids) ? b.result_ids.map(Number) : null })));
router.post('/:domaine/campagne', ok((db, b, req) => P.versCampagne(db, req.params.domaine, b.campagne_id)));
router.post('/:domaine/fiche', ok((db, b, req) => P.ficheDuPrestataire(db, req.params.domaine)));
router.post('/:domaine/ignorer', ok((db, b, req) => P.ignorer(db, req.params.domaine, { raison: b.raison, retablir: b.retablir === true })));

module.exports = router;
