// backend/routes/objectifRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const objectifController = require('../controllers/objectifController');

router.use(authMiddleware);

router.get('/summary', objectifController.getSummary);
router.get('/params', objectifController.getParams);
router.put('/params', objectifController.updateParams);

module.exports = router;
