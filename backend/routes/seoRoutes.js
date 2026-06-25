// backend/routes/seoRoutes.js
// Module SEO — routes LECTURE SEULE (SELECT only). Aucune écriture : les données sont
// produites par le worker Python (seo_worker).
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const seoController = require('../controllers/seoController');

router.use(authMiddleware);

router.get('/sites', seoController.getSites);
router.get('/overview', seoController.getOverview);
router.get('/pages', seoController.getPages);
router.get('/graph', seoController.getGraph);
router.get('/affamees', seoController.getAffamees);
// File de jobs : POST = créer une demande (seule écriture, sur seo_jobs uniquement) ; GET = statut.
router.post('/jobs', seoController.createJob);
router.get('/jobs', seoController.getJob);

module.exports = router;
