// backend/routes/emailSignatureRoutes.js
const express = require('express');
const router = express.Router();
const c = require('../controllers/emailSignatureController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/', c.list);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
