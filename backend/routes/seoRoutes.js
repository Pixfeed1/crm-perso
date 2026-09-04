// backend/routes/seoRoutes.js
// Module SEO — routes LECTURE SEULE (SELECT only). Aucune écriture : les données sont
// produites par le worker Python (seo_worker).
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const seoController = require('../controllers/seoController');
const seoIndexationController = require('../controllers/seoIndexationController');
const seoPagespeedController = require('../controllers/seoPagespeedController');
const seoAnalyticsController = require('../controllers/seoAnalyticsController');
const seoAuthorityController = require('../controllers/seoAuthorityController');

router.use(authMiddleware);

router.get('/sites', seoController.getSites);
// Sites : config utilisateur, pilotee depuis l'UI (le worker lit seo_sites, plus config.py).
router.post('/sites', seoController.createSite);
router.put('/sites/:id', seoController.updateSite);
router.delete('/sites/:id', seoController.deleteSite);
router.get('/overview', seoController.getOverview);
router.get('/pages', seoController.getPages);
router.get('/graph', seoController.getGraph);
router.get('/affamees', seoController.getAffamees);
router.get('/gsc/status', seoController.getGscStatus);
router.get('/schedule', seoController.getSchedule);
router.get('/quasi-victoires', seoController.getQuasiVictoires);
router.get('/cannibalisation', seoController.getCannibalisation);
router.get('/ctr-anomalies', seoController.getCtrAnomalies);
router.get('/opportunites', seoController.getOpportunites);
router.get('/audit', seoController.getAudit);
// Indexation Google / sitemap / redirections / focus keywords : memes requetes que le MCP.
router.get('/indexation', seoIndexationController.getReport);
router.get('/indexation/sitemap-check', seoIndexationController.checkSitemap);
// Core Web Vitals / PageSpeed (job 'pagespeed' du worker).
router.get('/pagespeed', seoPagespeedController.getLatest);
router.get('/pagespeed/history', seoPagespeedController.getHistory);
// Google Analytics 4 (job 'ga_sync' du worker, propriete GA4 par site).
router.get('/analytics', seoAnalyticsController.getOverview);
// Autorite du domaine + liens entrants (job 'authority' : Open PageRank + Bing WMT).
router.get('/authority', seoAuthorityController.getOverview);
// Suivi de positions (rank tracker) — lecture seule sur seo_gsc_daily.
router.get('/positions/summary', seoController.getPositionsSummary);
router.get('/positions/keywords', seoController.getPositionsKeywords);
router.get('/positions/keyword', seoController.getPositionKeywordSeries);
router.get('/positions/pages', seoController.getPositionsPages);
router.get('/positions/page', seoController.getPositionsPage);
router.get('/positions/yoast', seoController.getPositionsYoast);
// Watchlist : Node écrit seo_tracked_keywords (config utilisateur, exception).
router.get('/tracked', seoController.getTrackedKeywords);
router.post('/tracked', seoController.addTrackedKeyword);
router.delete('/tracked/:id', seoController.deleteTrackedKeyword);
// File de jobs : POST = créer une demande (seule écriture, sur seo_jobs uniquement) ; GET = statut.
router.post('/jobs', seoController.createJob);
router.get('/jobs', seoController.getJob);
router.get('/jobs/:id', seoController.getJobById);
// Annulation d'un crawl actif (écriture sur seo_jobs uniquement).
router.post('/jobs/:id/cancel', seoController.cancelJob);

module.exports = router;
