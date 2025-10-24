// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

// Fonction de connexion
const login = async (req, res) => {
  console.log("[AUTH] Démarrage de la procédure de login");
  console.log("[AUTH] Données reçues:", { username: req.body.username, passwordProvided: !!req.body.password });
  console.log("[AUTH] JWT_SECRET défini:", process.env.JWT_SECRET ? "Oui" : "Non");
  console.log("[AUTH] Type de JWT_SECRET:", typeof process.env.JWT_SECRET);
  
  const { username, password } = req.body;
  
  try {
    // Vérifier si l'utilisateur existe
    console.log("[AUTH] Recherche de l'utilisateur dans la base de données:", username);
    const user = await userModel.getUserByUsername(username);
    if (!user) {
      console.log("[AUTH] Utilisateur non trouvé:", username);
      return res.status(401).json({ message: 'Identifiants invalides' });
    }
    console.log("[AUTH] Utilisateur trouvé, ID:", user.id);
    
    // Vérifier le mot de passe
    console.log("[AUTH] Vérification du mot de passe");
    const passwordIsValid = await userModel.verifyPassword(password, user.password);
    if (!passwordIsValid) {
      console.log("[AUTH] Mot de passe invalide pour l'utilisateur:", username);
      return res.status(401).json({ message: 'Identifiants invalides' });
    }
    console.log("[AUTH] Mot de passe valide, authentification réussie");
    
    // Génération du token JWT avec gestion d'erreur spécifique
    try {
      // Utiliser une solution de secours si JWT_SECRET n'est pas défini
      const jwtSecret = process.env.JWT_SECRET || 'cle_secrete_temporaire_ne_pas_utiliser_en_production';
      console.log("[AUTH] Clé secrète utilisée:", jwtSecret ? "Définie" : "Non définie");
      
      // Préparer le payload
      const payload = { 
        id: user.id, 
        username: user.username 
      };
      console.log("[AUTH] Payload du token:", payload);
      
      // Options de signature
      const signOptions = { 
        expiresIn: '24h',
        algorithm: 'HS256'  // Spécifier explicitement l'algorithme
      };
      console.log("[AUTH] Options de signature:", signOptions);
      
      // Générer un token JWT
      const token = jwt.sign(payload, jwtSecret, signOptions);
      
      // Valider le format du token
      console.log("[AUTH] Token JWT généré avec succès");
      console.log("[AUTH] Format JWT valide:", token.split('.').length === 3 ? "Oui" : "Non");
      console.log("[AUTH] Longueur du token:", token.length);
      
      // Vérification supplémentaire du token 
      try {
        const decoded = jwt.verify(token, jwtSecret);
        console.log("[AUTH] Token vérifié avec succès. Payload décodé:", decoded);
      } catch (verifyError) {
        console.error("[AUTH] Erreur lors de la vérification du token:", verifyError);
        console.error("[AUTH] Trace d'erreur:", verifyError.stack);
        // Continuer malgré l'erreur de vérification pour diagnostic
      }
      
      // Envoyer la réponse avec le token et les informations utilisateur
      console.log("[AUTH] Envoi de la réponse avec token");
      res.status(200).json({
        user: {
          id: user.id,
          username: user.username
        },
        token
      });
    } catch (jwtError) {
      console.error("[AUTH] Erreur lors de la génération du token JWT:", jwtError);
      console.error("[AUTH] Trace d'erreur JWT:", jwtError.stack);
      return res.status(500).json({ message: 'Erreur serveur lors de la génération du token' });
    }
  } catch (error) {
    console.error("[AUTH] Erreur lors de la connexion:", error);
    console.error("[AUTH] Trace d'erreur:", error.stack);
    res.status(500).json({ message: 'Erreur serveur lors de la connexion' });
  }
};

// Fonction pour vérifier si l'utilisateur est authentifié
const checkAuth = async (req, res) => {
  console.log("[AUTH] Vérification d'authentification demandée");
  console.log("[AUTH] Données utilisateur dans la requête:", req.user);
  
  try {
    // Le middleware d'authentification a déjà validé le token et ajouté req.user
    console.log("[AUTH] Recherche de l'utilisateur ID:", req.user.id);
    const userExists = await userModel.getUserById(req.user.id);
    
    if (!userExists) {
      console.log("[AUTH] Utilisateur ID non trouvé dans la base:", req.user.id);
      return res.status(401).json({ 
        authenticated: false,
        message: 'Utilisateur non trouvé' 
      });
    }
    
    console.log("[AUTH] Utilisateur vérifié avec succès, ID:", userExists.id);
    res.status(200).json({ 
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username
      },
      message: 'Utilisateur authentifié'
    });
  } catch (error) {
    console.error("[AUTH] Erreur lors de la vérification de l'authentification:", error);
    console.error("[AUTH] Trace d'erreur:", error.stack);
    res.status(500).json({ 
      authenticated: false,
      message: "Erreur serveur lors de la vérification de l'authentification" 
    });
  }
};

// Fonction pour générer un token de réinitialisation de mot de passe
const forgotPassword = async (req, res) => {
  console.log("[AUTH] Demande de réinitialisation de mot de passe");
  const { username } = req.body;

  try {
    // Vérifier si l'utilisateur existe
    const user = await userModel.getUserByUsername(username);
    if (!user) {
      console.log("[AUTH] Utilisateur non trouvé:", username);
      // Pour des raisons de sécurité, ne pas révéler si l'utilisateur existe ou non
      return res.status(200).json({
        message: 'Si un compte existe avec cet identifiant, un token de réinitialisation a été généré',
        resetToken: null
      });
    }

    console.log("[AUTH] Utilisateur trouvé, génération du token de réinitialisation");

    // Générer un token unique
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Token expire dans 1 heure
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Sauvegarder le token dans la base de données
    const db = require('../config/pgConfig');
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, resetToken, expiresAt.toISOString()],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    console.log("[AUTH] Token de réinitialisation généré et sauvegardé");

    // En production, envoyer le token par email
    // Pour le développement, on le retourne directement
    res.status(200).json({
      message: 'Token de réinitialisation généré avec succès',
      resetToken: resetToken,
      expiresIn: '1 heure'
    });
  } catch (error) {
    console.error("[AUTH] Erreur lors de la génération du token:", error);
    res.status(500).json({ message: 'Erreur serveur lors de la génération du token' });
  }
};

// Fonction pour réinitialiser le mot de passe avec un token
const resetPasswordWithToken = async (req, res) => {
  console.log("[AUTH] Tentative de réinitialisation de mot de passe avec token");
  const { resetToken, newPassword } = req.body;

  try {
    // Valider les données
    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: 'Token et nouveau mot de passe requis' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Rechercher le token dans la base de données
    const db = require('../config/pgConfig');
    const tokenData = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0',
        [resetToken],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });

    if (!tokenData) {
      console.log("[AUTH] Token invalide ou déjà utilisé");
      return res.status(400).json({ message: 'Token invalide ou déjà utilisé' });
    }

    // Vérifier si le token a expiré
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);

    if (now > expiresAt) {
      console.log("[AUTH] Token expiré");
      return res.status(400).json({ message: 'Token expiré' });
    }

    console.log("[AUTH] Token valide, réinitialisation du mot de passe pour l'utilisateur ID:", tokenData.user_id);

    // Réinitialiser le mot de passe
    await userModel.resetPassword(tokenData.user_id, newPassword);

    // Marquer le token comme utilisé
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE password_reset_tokens SET used = 1, used_at = CURRENT_TIMESTAMP WHERE id = ?',
        [tokenData.id],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    console.log("[AUTH] Mot de passe réinitialisé avec succès");

    res.status(200).json({
      message: 'Mot de passe réinitialisé avec succès',
      success: true
    });
  } catch (error) {
    console.error("[AUTH] Erreur lors de la réinitialisation du mot de passe:", error);
    res.status(500).json({ message: 'Erreur serveur lors de la réinitialisation du mot de passe' });
  }
};

module.exports = {
  login,
  checkAuth,
  forgotPassword,
  resetPasswordWithToken
};