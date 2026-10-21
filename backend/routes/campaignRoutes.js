// backend/routes/campaignRoutes.js
// Campagnes de prospection — monté sous /api/campagnes.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/campaignController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/sender-check', ctrl.senderCheck); // avant /:id
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/items/from-leads', ctrl.addLeads);
router.post('/:id/items/from-crawl', ctrl.addFromCrawl);
router.post('/:id/items/validate', ctrl.validateMany);
router.patch('/:id/items/:itemId', ctrl.updateItem);
router.post('/:id/schedule', ctrl.schedule);
router.post('/:id/pause', ctrl.pause);
router.post('/:id/resume', ctrl.resume);
router.post('/:id/stop', ctrl.stop);

module.exports = router;
