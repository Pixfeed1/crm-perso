// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  console.log('\n=== MIDDLEWARE D\'AUTHENTIFICATION DÉMARRÉ ===');
  console.log('URL de la requête:', req.originalUrl);
  console.log('Méthode HTTP:', req.method);
  
  // Log tous les headers pour le débogage
  console.log('Headers reçus:');
  console.log(JSON.stringify(req.headers, null, 2));
  
  // Récupérer le token du header Authorization
  const authHeader = req.headers.authorization;
  console.log('Header d\'autorisation:', authHeader);
  
  if (!authHeader) {
    console.log('ERREUR: Aucun header d\'autorisation trouvé');
    return res.status(401).json({ message: 'Accès non autorisé, token manquant' });
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.log('ERREUR: Format de token invalide, doit commencer par "Bearer "');
    return res.status(401).json({ message: 'Accès non autorisé, format de token invalide' });
  }
  
  // Extraire le token
  const token = authHeader.split(' ')[1];
  console.log('Token extrait (premiers caractères):', token.substring(0, 15) + '...');
  
  if (!token) {
    console.log('ERREUR: Token vide après extraction');
    return res.status(401).json({ message: 'Accès non autorisé, token vide' });
  }
  
  try {
    console.log('Tentative de vérification du token avec JWT_SECRET');
    console.log('Valeur de JWT_SECRET disponible:', !!process.env.JWT_SECRET);
    
    if (!process.env.JWT_SECRET) {
      console.log('ERREUR CRITIQUE: JWT_SECRET n\'est pas défini dans les variables d\'environnement');
      return res.status(500).json({ message: 'Erreur de configuration du serveur' });
    }
    
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Décodage JWT réussi:', { 
      id: decoded.id, 
      username: decoded.username,
      exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'non défini',
      iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : 'non défini'
    });
    
    // Vérifier l'expiration manuellement
    if (decoded.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      console.log('Vérification de l\'expiration:', {
        tokenExpiration: decoded.exp,
        currentTime: currentTime,
        difference: decoded.exp - currentTime,
        isExpired: decoded.exp < currentTime
      });
      
      if (decoded.exp < currentTime) {
        console.log('ERREUR: Token expiré');
        return res.status(401).json({ message: 'Token expiré' });
      }
    } else {
      console.log('Attention: Token ne contient pas de date d\'expiration');
    }
    
    // Ajouter les infos utilisateur à la requête
    req.user = {
      id: decoded.id,
      username: decoded.username
    };
    console.log('Utilisateur authentifié:', req.user);
    
    console.log('=== MIDDLEWARE D\'AUTHENTIFICATION TERMINÉ AVEC SUCCÈS ===\n');
    next();
  } catch (error) {
    console.log('ERREUR lors de la vérification du token:');
    console.log('Type d\'erreur:', error.name);
    console.log('Message d\'erreur:', error.message);
    console.log('Stack d\'erreur:', error.stack);
    
    let errorMessage = 'Token invalide ou expiré';
    
    // Personnaliser le message d'erreur en fonction du type d'erreur JWT
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token expiré';
      console.log('Détails d\'expiration:', { expiredAt: error.expiredAt });
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Token invalide: ' + error.message;
    } else if (error.name === 'NotBeforeError') {
      errorMessage = 'Token pas encore valide';
    }
    
    console.log('=== MIDDLEWARE D\'AUTHENTIFICATION TERMINÉ AVEC ERREUR ===\n');
    return res.status(401).json({ message: errorMessage });
  }
};

module.exports = authMiddleware;