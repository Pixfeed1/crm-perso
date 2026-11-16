// Sauvegardes hors du serveur (Paramètres > Sauvegardes) — monté sous /api/sauvegardes, session de l'interface.
//   GET  /etat            connexion, clé, dernier envoi, dernier test
//   GET  /connecter       { authUrl } : Google, scope drive.file seulement
//   GET  /cle             la clé de chiffrement, une seule fois (tant qu'elle n'est pas marquée rangée)
//   POST /cle/rangee      « j'ai rangé la clé » : elle ne s'affichera plus
//   POST /envoyer         une copie chiffrée maintenant (en arrière-plan : l'état donne l'étape en cours)
//   POST /tester          redescendre la dernière copie, la déchiffrer, la relire (idem)
//   PUT  /reglages        { garder_jours }
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const S = require('../services/sauvegardeDrive');
const google = require('../services/seoGoogleAuth');

const router = express.Router();
router.use(authMiddleware);
const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, req.body || {})); }
  catch (e) {
    if (!e.status || e.status >= 500) console.error('[Sauvegarde Drive]', e.message);
    res.status(e.status || 500).json({ message: e.message });
  }
};
router.get('/etat', ok((db) => S.etat(db)));
router.get('/connecter', ok(async () => {
  if (!google.configured()) throw Object.assign(new Error('Connexion Google non configurée dans backend/.env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL) : la même que pour la Search Console'), { status: 503 });
  return { authUrl: google.getDriveAuthUrl() };
}));
router.get('/cle', ok((db) => S.cleAAfficher(db)));
router.post('/cle/rangee', ok((db) => S.cleRangee(db)));
router.post('/envoyer', ok((db) => S.lancer(db, 'envoyer')));
router.post('/tester', ok((db) => S.lancer(db, 'tester')));
router.put('/reglages', ok((db, b) => S.reglages(db, b)));

module.exports = router;
