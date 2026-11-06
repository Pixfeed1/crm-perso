// backend/routes/campaignRoutes.js
// Campagnes de prospection — monté sous /api/campagnes.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/campaignController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/sender-check', ctrl.senderCheck); // avant /:id
// Boîte d'envoi (lot 7) : réponses et rebonds lus en lecture seule, refus soumis à confirmation.
const boite = require('../services/boiteService');
const okBoite = (fn) => async (req, res) => { try { res.json(await fn(req.app.locals.db, req)); } catch (e) { res.status(e.status || 500).json({ message: e.status ? e.message : `Boîte d'envoi : ${e.message}` }); } };
router.get('/boite', okBoite((db) => boite.lister(db)));
// Test A/B de la question finale : formulations proposées, réglage par campagne, résultats.
router.get('/ab/propositions', okBoite(async () => require('../utils/abQuestion').catalogue()));
router.put('/:id/ab', okBoite((db, req) => require('../services/campaignService').setAbTest(db, req.params.id, (req.body || {}).ab === undefined ? null : req.body.ab)));
router.post('/boite/relever', okBoite((db) => boite.relever(db)));
router.post('/boite/:id/confirmer', okBoite((db, req) => boite.confirmer(db, req.params.id, (req.body || {}).decision)));
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/items/from-leads', ctrl.addLeads);
router.post('/:id/items/from-crawl', ctrl.addFromCrawl);
router.post('/:id/items/validate', ctrl.validateMany);
router.post('/:id/items/reprendre', ctrl.reprendreMany);
router.patch('/:id/items/:itemId', ctrl.updateItem);
router.post('/:id/items/:itemId/reanalyze', ctrl.reanalyzeItem);
router.post('/:id/items/:itemId/reprendre', ctrl.reprendreItem);
router.post('/:id/reanalyser', ctrl.reanalyser);
router.post('/:id/schedule', ctrl.schedule);
router.post('/:id/pause', ctrl.pause);
router.post('/:id/resume', ctrl.resume);
router.post('/:id/stop', ctrl.stop);

module.exports = router;
