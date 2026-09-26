// backend/routes/domainSignalRoutes.js
// Signaux d'intention (nouveaux domaines .fr AFNIC) — monté sous /api/portefeuille/signaux.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/domainSignalController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', ctrl.list);
router.get('/imports', ctrl.imports);
router.post('/import', ctrl.startImport);
router.post('/recheck', ctrl.recheck);
router.post('/promote', ctrl.promote);
router.patch('/:id', ctrl.update);

module.exports = router;
