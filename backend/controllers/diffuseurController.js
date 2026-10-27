// backend/controllers/diffuseurController.js
// Diffuseur : préparation de la diffusion des créations 3D. Voir services/diffuseurService.js.
const service = require('../services/diffuseurService');

const fail = (res, e, ctx) => {
  if (!e.status) console.error(`[Diffuseur] ${ctx}:`, e.message);
  res.status(e.status || 500).json({ message: e.status ? e.message : 'Erreur serveur' });
};
const db = (req) => req.app.locals.db;
const id = (v) => parseInt(v, 10);
const ints = (v) => (Array.isArray(v) ? v.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x)) : []);
const wrap = (ctx, fn) => async (req, res) => { try { await fn(req, res); } catch (e) { fail(res, e, ctx); } };

module.exports = {
  getReglages: wrap('réglages', async (req, res) => res.json(await service.getReglages(db(req)))),
  updateReglages: wrap('réglages', async (req, res) => res.json(await service.updateReglages(db(req), req.body || {}))),

  listScenes: wrap('scènes', async (req, res) => {
    // Les résultats de JurojinReposter sont relus à chaque ouverture de l'écran.
    await service.lireResultatsBluesky(db(req)).catch((e) => console.error('[Diffuseur] résultats Bluesky:', e.message));
    res.json(await service.listScenes(db(req)));
  }),
  getScene: wrap('scène', async (req, res) => res.json(await service.getScene(db(req), id(req.params.id)))),
  createScene: wrap('création', async (req, res) => res.status(201).json(await service.createScene(db(req), req.body || {}))),
  updateScene: wrap('scène', async (req, res) => res.json(await service.updateScene(db(req), id(req.params.id), req.body || {}))),
  deleteScene: wrap('suppression', async (req, res) => res.json(await service.deleteScene(db(req), id(req.params.id)))),

  // POST /scenes/:id/images (multipart, champ « images », 50 Mo par fichier)
  addImages: wrap('envoi', async (req, res) => res.json(await service.addImages(db(req), id(req.params.id), req.files || []))),
  updateImage: wrap('image', async (req, res) => res.json(await service.updateImage(db(req), id(req.params.imageId), req.body || {}))),
  deleteImage: wrap('image', async (req, res) => res.json(await service.deleteImage(db(req), id(req.params.imageId)))),
  // POST /images/:imageId/textes : rédaction par Claude (une image par appel)
  genererTextes: wrap('textes', async (req, res) => res.json(await service.genererTextes(db(req), id(req.params.imageId)))),

  planifier: wrap('calendrier', async (req, res) => res.json(await service.planifier(db(req), req.body || {}))),

  listPosts: wrap('publications', async (req, res) => {
    await service.lireResultatsBluesky(db(req)).catch(() => {});
    res.json(await service.listPosts(db(req), req.query || {}));
  }),
  updatePost: wrap('publication', async (req, res) => res.json(await service.updatePost(db(req), id(req.params.postId), req.body || {}))),
  validerPlusieurs: wrap('validation', async (req, res) => {
    const ids = ints(req.body && req.body.ids);
    if (!ids.length) return res.status(400).json({ message: 'Aucune publication sélectionnée' });
    const statut = ['valide', 'a_valider', 'rejete'].includes(req.body.statut) ? req.body.statut : 'valide';
    return res.json(await service.validerPlusieurs(db(req), ids, statut));
  }),

  // GET /export/:cible?from=&to= -> CSV (pinterest | meta | x)
  exporter: wrap('export', async (req, res) => {
    const r = await service.exporter(db(req), req.params.cible, req.query || {});
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.fichier}"`);
    res.setHeader('X-Nb-Lignes', String(r.nb));
    res.send(r.csv);
  })
};
