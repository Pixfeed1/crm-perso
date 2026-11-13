// Netlinking multi-site — monté sous /api/seo/outreach (AVANT /api/seo). Un seul endpoint d'envoi :
// POST /send, appelé par l'onglet SEO (session) et par le serveur MCP (secret partagé OUTILS_MCP_SECRET).
// Toutes les règles sont dans services/outreachService.js ; aucune dans l'interface.
//   POST /send { site_id, target_id | domaine, niche_nom?, destinataire, objet, corps, relance_de?, simulation? (true par défaut) }
//              domaine seul : fiche cible reprise, ou créée à l'envoi dans la niche niche_nom du site
//              (créée si absente), à défaut « Hors campagne »
//   GET|POST /verifier { domaine | adresse }           déjà contacté ? (tous sites, ancien envoi compris)
//   GET|POST /mails { site, campagne, statut, relances_dues, target_id }
//   GET|POST /sans-reponse { site }                    cibles sans réponse (accueil du module)
//   POST /reponse { target_id, date?, nature }         positif | negatif | payant | refus | abandon
//   POST /cibles { site, niche_id | niche_nom, creer_si_absente?, cibles: [...], simulation? }   ajout de cibles
//   POST /niches { site_id, nom, page_cible?, hubs?, simulation? }   création d'une niche rattachée au site
//   GET /config                                        sites qui ont un expéditeur réglé
const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/authMiddleware');
const S = require('../services/outreachService');
const { sitesConfigures } = require('../services/outreachSite');

const router = express.Router();
function secretOk(req) {
  const attendu = process.env.OUTILS_MCP_SECRET || '';
  const recu = String(req.headers['x-outils-secret'] || '');
  if (attendu.length < 32 || recu.length !== attendu.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu));
}
router.use((req, res, next) => (secretOk(req) ? next() : authMiddleware(req, res, next)));

const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req.app.locals.db, { ...(req.query || {}), ...(req.body || {}) })); }
  catch (e) {
    if (!e.status || e.status >= 500) console.error('[Outreach]', e.message);
    res.status(e.status || 500).json({ message: e.status ? e.message : `Outreach : ${e.message}`, ...(e.precedents ? { precedents: e.precedents } : {}), ...(e.prochain_envoi_le ? { prochain_envoi_le: e.prochain_envoi_le } : {}), ...(e.niche_id ? { niche_id: e.niche_id } : {}) });
  }
};
const vrai = (v) => v === true || v === 'true' || v === '1';

router.get('/config', ok(async () => ({ sites: sitesConfigures() })));
router.post('/send', ok((db, b) => S.envoyerMail(db, b)));
for (const m of ['get', 'post']) {
  router[m]('/verifier', ok((db, b) => S.dejaContacte(db, { domaine: b.domaine, adresse: b.adresse })));
  router[m]('/mails', ok((db, b) => S.lister(db, { site: b.site, campagne: b.campagne, statut: b.statut, relances_dues: vrai(b.relances_dues), target_id: b.target_id })));
  router[m]('/sans-reponse', ok(async (db, b) => ({ cibles: await S.sansReponse(db, { site: b.site }) })));
}
router.post('/reponse', ok((db, b) => S.marquerReponse(db, { target_id: b.target_id, date: b.date, nature: b.nature })));
router.post('/cibles', ok((db, b) => S.ajouterCibles(db, { site: b.site || b.site_id, niche_id: b.niche_id, niche_nom: b.niche_nom, creer_si_absente: vrai(b.creer_si_absente), cibles: b.cibles, simulation: b.simulation !== false })));
router.post('/niches', ok((db, b) => S.creerNiche(db, { site: b.site || b.site_id, nom: b.nom, page_cible: b.page_cible, hubs: b.hubs, simulation: b.simulation !== false })));

module.exports = router;
