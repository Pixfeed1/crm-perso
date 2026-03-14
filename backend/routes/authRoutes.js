// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Route de connexion
router.post('/login', authController.login);

// Route pour verifier l'authentification
router.get('/check', authMiddleware, authController.checkAuth);

// Route pour demander la reinitialisation du mot de passe
router.post('/forgot-password', authController.forgotPassword);

// Route pour reinitialiser le mot de passe
router.post('/reset-password', authController.resetPassword);

module.exports = router;
