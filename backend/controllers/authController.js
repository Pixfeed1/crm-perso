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

module.exports = {
  login,
  checkAuth
};