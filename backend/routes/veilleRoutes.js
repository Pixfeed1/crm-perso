// backend/routes/veilleRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const veilleController = require('../controllers/veilleController');

router.use(authMiddleware);

router.get('/annonces', veilleController.getAnnonces);
router.post('/annonces/:id/ecarter', veilleController.ecarter);
router.get('/criteres', veilleController.getCriteres);
router.put('/criteres', veilleController.updateCriteres);
router.post('/run', veilleController.run);

module.exports = router;
