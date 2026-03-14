// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // Recuperer le token du header Authorization
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Acces non autorise, token manquant' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Acces non autorise, format de token invalide' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Acces non autorise, token vide' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      console.error('[AUTH] JWT_SECRET non defini');
      return res.status(500).json({ message: 'Erreur de configuration du serveur' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verifier l'expiration
    if (decoded.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (decoded.exp < currentTime) {
        return res.status(401).json({ message: 'Token expire' });
      }
    }

    // Ajouter les infos utilisateur a la requete
    req.user = {
      id: decoded.id,
      username: decoded.username
    };

    next();
  } catch (error) {
    let errorMessage = 'Token invalide ou expire';

    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token expire';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Token invalide';
    }

    return res.status(401).json({ message: errorMessage });
  }
};

module.exports = authMiddleware;
