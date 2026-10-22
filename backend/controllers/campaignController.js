// backend/controllers/campaignController.js
// Campagnes de prospection : préparer, relire, programmer. Aucun envoi sans validation.
const service = require('../services/campaignService');
const emailService = require('../services/emailService');
const seoOutreach = require('../services/seoOutreachService');

const ints = (v) => (Array.isArray(v) ? v.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x)) : []);
const fail = (res, e, ctx) => {
  console.error(`[Campagnes] ${ctx}:`, e.message);
  res.status(e.status || 500).json({ message: e.status ? e.message : 'Erreur serveur' });
};

module.exports = {
  list: async (req, res) => { try { res.json(await service.listCampaigns(req.app.locals.db)); } catch (e) { fail(res, e, 'liste'); } },
  create: async (req, res) => { try { res.status(201).json(await service.createCampaign(req.app.locals.db, req.body || {})); } catch (e) { fail(res, e, 'création'); } },
  get: async (req, res) => { try { res.json(await service.getCampaignFull(req.app.locals.db, req.params.id)); } catch (e) { fail(res, e, 'lecture'); } },
  update: async (req, res) => { try { res.json(await service.updateCampaign(req.app.locals.db, req.params.id, req.body || {})); } catch (e) { fail(res, e, 'réglages'); } },
  remove: async (req, res) => { try { res.json(await service.removeCampaign(req.app.locals.db, req.params.id)); } catch (e) { fail(res, e, 'suppression'); } },

  // POST /:id/items/from-leads { lead_ids }
  addLeads: async (req, res) => {
    const ids = ints(req.body?.lead_ids);
    if (!ids.length) return res.status(400).json({ message: 'Aucun prospect sélectionné' });
    try { res.json(await service.addLeads(req.app.locals.db, req.params.id, ids)); } catch (e) { fail(res, e, 'ajout prospects'); }
  },
  // POST /:id/items/from-crawl { job_id, result_ids }
  addFromCrawl: async (req, res) => {
    const ids = ints(req.body?.result_ids); const jobId = parseInt(req.body?.job_id, 10);
    if (!ids.length || Number.isNaN(jobId)) return res.status(400).json({ message: 'Crawl ou sélection manquants' });
    try { res.json(await service.addFromCrawl(req.app.locals.db, req.params.id, jobId, ids)); } catch (e) { fail(res, e, 'ajout crawl'); }
  },
  // PATCH /:id/items/:itemId { subject?, body?, statut?, raison?, mode? }
  updateItem: async (req, res) => {
    try { res.json(await service.updateItem(req.app.locals.db, req.params.id, req.params.itemId, req.body || {})); } catch (e) { fail(res, e, 'ligne'); }
  },
  // POST /:id/items/:itemId/reanalyze -> mesures du jour, SIRENE, email régénéré, ligne reclassée
  reanalyzeItem: async (req, res) => {
    try { res.json(await service.reanalyzeItem(req.app.locals.db, req.params.id, req.params.itemId)); } catch (e) { fail(res, e, 'réanalyse'); }
  },
  // POST /:id/items/:itemId/reprendre { to_email? } -> ligne exclue sans adresse, en échec ou arrêtée reclassée sans recrawl
  reprendreItem: async (req, res) => {
    try { res.json(await service.reprendreItem(req.app.locals.db, req.params.id, req.params.itemId, { to_email: req.body?.to_email })); } catch (e) { fail(res, e, 'reprise'); }
  },
  // POST /:id/items/reprendre { quoi: 'sans_email' | 'echecs' }
  reprendreMany: async (req, res) => {
    const quoi = req.body?.quoi === 'echecs' ? 'echecs' : 'sans_email';
    try { res.json(await service.reprendreMany(req.app.locals.db, req.params.id, quoi)); } catch (e) { fail(res, e, 'reprise en lot'); }
  },
  // POST /:id/items/validate { ids, statut? }
  validateMany: async (req, res) => {
    const ids = ints(req.body?.ids);
    if (!ids.length) return res.status(400).json({ message: 'Aucune ligne sélectionnée' });
    try { res.json(await service.validateMany(req.app.locals.db, req.params.id, ids, req.body?.statut === 'pret' ? 'pret' : 'valide')); } catch (e) { fail(res, e, 'validation'); }
  },
  // POST /:id/schedule { test?, test_emails? }
  schedule: async (req, res) => {
    try { res.json(await service.schedule(req.app.locals.db, req.params.id, { test: !!req.body?.test, test_emails: req.body?.test_emails, debut: req.body?.debut || null })); } catch (e) { fail(res, e, 'programmation'); }
  },
  pause: async (req, res) => { try { res.json(await service.pause(req.app.locals.db, req.params.id)); } catch (e) { fail(res, e, 'pause'); } },
  resume: async (req, res) => { try { res.json(await service.resume(req.app.locals.db, req.params.id)); } catch (e) { fail(res, e, 'reprise'); } },
  stop: async (req, res) => { try { res.json(await service.stop(req.app.locals.db, req.params.id)); } catch (e) { fail(res, e, 'arrêt'); } },
  // GET /sender-check
  senderCheck: async (req, res) => { try { res.json(await service.checkSender(emailService, seoOutreach)); } catch (e) { fail(res, e, 'expéditeur'); } }
};
