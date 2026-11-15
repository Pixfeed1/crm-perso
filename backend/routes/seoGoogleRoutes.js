// backend/routes/seoGoogleRoutes.js
// Connexion Google (Search Console + Analytics) depuis l'UI, en un clic.
//   GET /api/seo/google/auth      (authentifie)  -> { authUrl } a ouvrir dans le navigateur
//   GET /api/seo/google/callback  (PUBLIC)       -> retour de Google, stocke le jeton, redirige vers /seo
// Monte AVANT /api/seo dans server.js : le routeur SEO applique authMiddleware a tout, et
// Google ne porte pas notre JWT sur le callback. La protection du callback est l'etat signe.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const auth = require('../services/seoGoogleAuth');

router.get('/auth', authMiddleware, (req, res) => {
  if (!auth.configured()) {
    return res.status(503).json({
      message: 'Connexion Google non configurée : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et FRONTEND_URL doivent être définis dans backend/.env (client OAuth « Application Web »).',
      redirect_uri: auth.redirectUri(),
    });
  }
  try {
    res.json({ authUrl: auth.getAuthUrl(), redirect_uri: auth.redirectUri() });
  } catch (e) {
    console.error('[SEO] google auth url:', e.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/callback', async (req, res) => {
  const back = (status, detail) => {
    const q = new URLSearchParams({ google: status });
    if (detail) q.set('detail', String(detail).slice(0, 160));
    return res.redirect(`${auth.frontendUrl()}/seo?${q.toString()}`);
  };
  const { code, state, error } = req.query;
  const but = auth.verifyState(state);
  // Retour d'une connexion Google Drive pour les sauvegardes (même client, même adresse de retour).
  if (but === 'drive') {
    const retour = (statut, detail) => res.redirect(`${auth.frontendUrl()}/settings?${new URLSearchParams({ onglet: 'sauvegardes', drive: statut, ...(detail ? { detail: String(detail).slice(0, 200) } : {}) }).toString()}`);
    if (error) return retour('error', error);
    if (!code) return retour('error', 'code manquant');
    try {
      const t = await auth.exchangeCode(String(code));
      await require('../services/sauvegardeDrive').enregistrerConnexion(req.app.locals.db, t);
      console.log(`[Sauvegarde Drive] connexion enregistrée (${t.email || 'compte non précisé'})`);
      return retour('success');
    } catch (e) {
      console.error('[Sauvegarde Drive] retour Google :', e.message);
      return retour('error', e.message);
    }
  }
  if (error) return back('error', error);
  if (!but) return back('error', 'état invalide ou expiré, relancer la connexion');
  if (!code) return back('error', 'code manquant');
  try {
    const t = await auth.exchangeCode(String(code));
    await auth.storeToken(req.app.locals.db.pool, t);
    console.log(`[SEO] Connexion Google enregistrée (${t.email || 'compte non précisé'}) : ${t.scope}`);
    return back('success');
  } catch (e) {
    console.error('[SEO] google callback:', e.message);
    return back('error', e.message);
  }
});

module.exports = router;
