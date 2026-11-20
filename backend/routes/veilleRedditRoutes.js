// Veille Reddit — monté sous /api/veille-reddit (session). Lecture seule sur Reddit : rien n'y est jamais posté.
//   GET    /annonces                 liste (statut, etiquette, subreddit, budget=oui|non, depuis_heures, limite, apres)
//   PUT    /annonces/:id             { statut: vu | repondu | ecarte | nouveau, note }
//   POST   /passage                  passage manuel, en arrière-plan
//   GET    /reglages                 sources, règles, dernier passage, état de panne
//   POST   /sources  PUT/DELETE /sources/:id      { type: forum|recherche, valeur, etiquette: 3D|PixFeed, actif }
//   POST   /regles   PUT/DELETE /regles/:id       { type: garder_type|rejeter_type|exclusion|mot_cle, valeur, etiquette }
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const V = require('../services/veilleReddit');

const router = express.Router();
router.use(authMiddleware);
const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, req.body || {}, req)); }
  catch (e) {
    if (!e.status || e.status >= 500) console.error('[Veille Reddit]', e.message);
    res.status(e.status || 500).json({ message: e.message });
  }
};
router.get('/annonces', ok((db, b, req) => V.lister(db, { ...req.query, depuis_heures: req.query.depuis_heures === undefined ? 0 : req.query.depuis_heures, limite: req.query.limite || 100 })));
router.put('/annonces/:id', ok((db, b, req) => V.marquer(db, req.params.id, { statut: b.statut, note: b.note })));
router.post('/passage', ok(async (db) => V.lancer(db)));
router.get('/reglages', ok((db) => V.regles(db)));
router.post('/sources', ok((db, b) => V.ajouterSource(db, b)));
router.put('/sources/:id', ok((db, b, req) => V.modifierSource(db, req.params.id, b)));
router.delete('/sources/:id', ok((db, b, req) => V.supprimerSource(db, req.params.id)));
router.post('/regles', ok((db, b) => V.ajouterRegle(db, b)));
router.put('/regles/:id', ok((db, b, req) => V.modifierRegle(db, req.params.id, b)));
router.delete('/regles/:id', ok((db, b, req) => V.supprimerRegle(db, req.params.id)));

module.exports = router;
