// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const isDev = process.env.NODE_ENV !== 'production';

// Fonction de connexion
const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const db = req.app.locals.db;

    // Verifier si l'utilisateur existe
    const user = await userModel.getUserByUsername(db, username);
    if (!user) {
      return res.status(401).json({ message: 'Identifiants invalides' });
    }

    // Verifier le mot de passe
    const passwordIsValid = await userModel.verifyPassword(password, user.password);
    if (!passwordIsValid) {
      return res.status(401).json({ message: 'Identifiants invalides' });
    }

    // Generation du token JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("[AUTH] ERREUR: JWT_SECRET non defini");
      return res.status(500).json({ message: 'Configuration serveur invalide' });
    }

    const payload = { id: user.id, username: user.username };
    const signOptions = { expiresIn: '24h', algorithm: 'HS256' };
    const token = jwt.sign(payload, jwtSecret, signOptions);

    res.status(200).json({
      user: { id: user.id, username: user.username },
      token
    });
  } catch (error) {
    console.error("[AUTH] Erreur connexion:", error.message);
    res.status(500).json({ message: 'Erreur serveur lors de la connexion' });
  }
};

// Fonction pour verifier si l'utilisateur est authentifie
const checkAuth = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userExists = await userModel.getUserById(db, req.user.id);

    if (!userExists) {
      return res.status(401).json({ authenticated: false, message: 'Utilisateur non trouve' });
    }

    res.status(200).json({
      authenticated: true,
      user: { id: req.user.id, username: req.user.username },
      message: 'Utilisateur authentifie'
    });
  } catch (error) {
    console.error("[AUTH] Erreur verification:", error.message);
    res.status(500).json({ authenticated: false, message: "Erreur serveur" });
  }
};

// Fonction pour demander la reinitialisation du mot de passe
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const db = req.app.locals.db;

    if (!email) {
      return res.status(400).json({ message: 'Veuillez fournir une adresse email' });
    }

    const user = await userModel.getUserByEmail(db, email);

    // Pour des raisons de securite, renvoyer toujours un message de succes
    if (!user) {
      return res.status(200).json({
        message: 'Si cette adresse email existe, un lien de reinitialisation a ete envoye.'
      });
    }

    // Generer un token unique
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = Date.now() + 3600000; // 1 heure

    await userModel.saveResetToken(db, user.id, resetToken, resetTokenExpires);

    // En dev, afficher le lien dans la console
    if (isDev) {
      const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;
      console.log("[AUTH] Lien de reinitialisation:", resetLink);
    }

    res.status(200).json({
      message: 'Si cette adresse email existe, un lien de reinitialisation a ete envoye.',
      devToken: isDev ? resetToken : undefined
    });
  } catch (error) {
    console.error("[AUTH] Erreur forgot-password:", error.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Fonction pour reinitialiser le mot de passe
const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const db = req.app.locals.db;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token et mot de passe requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caracteres' });
    }

    const user = await userModel.getUserByResetToken(db, token);

    if (!user) {
      return res.status(400).json({ message: 'Token invalide ou expire' });
    }

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    await userModel.updatePassword(db, user.id, hashedPassword);
    await userModel.clearResetToken(db, user.id);

    res.status(200).json({ message: 'Mot de passe reinitialise avec succes' });
  } catch (error) {
    console.error("[AUTH] Erreur reset-password:", error.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  login,
  checkAuth,
  forgotPassword,
  resetPassword
};
