// src/services/mockAuthService.js
import jwt from 'jsonwebtoken';

// Clé secrète pour l'environnement de développement uniquement
const JWT_SECRET = 'cle_secrete_dev';

// Service d'authentification simulé
class MockAuthService {
  // Login simulé qui génère un vrai token JWT
  login(username, password) {
    // Simuler la vérification des identifiants (en production, cela serait fait côté serveur)
    if (!username || !password) {
      return Promise.reject(new Error('Identifiants requis'));
    }
    
    // Créer un payload utilisateur
    const userData = {
      id: 1,
      username,
      role: 'user'
    };
    
    // Générer un token JWT valide avec la même clé que le backend
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '24h' });
    
    // Retourner une promesse résolue comme le ferait une vraie API
    return Promise.resolve({
      token,
      user: userData
    });
  }
}

export default new MockAuthService();