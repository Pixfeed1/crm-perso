// backend/routes/seoBacklinksRoutes.js
// Module Backlinks (suite SEO) — monté sous /api/seo/backlinks. Pipeline séparé
// du CRM client (tables seo_*, envoi Gmail perso).
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/seoBacklinksController');

router.use(authMiddleware);

router.get('/status', ctrl.status);

router.get('/niches', ctrl.listNiches);
router.post('/niches', ctrl.createNiche);
router.delete('/niches/:id', ctrl.deleteNiche);

router.post('/niches/:id/discover', ctrl.discover);
router.post('/niches/:id/verify', ctrl.verify);
router.post('/niches/:id/score', ctrl.score);
router.get('/niches/:id/targets', ctrl.listTargets);

router.patch('/targets/:id', ctrl.updateTarget);
router.post('/targets/:id/draft-email', ctrl.draftEmail);
router.post('/targets/:id/send-email', ctrl.sendEmail);

module.exports = router;
