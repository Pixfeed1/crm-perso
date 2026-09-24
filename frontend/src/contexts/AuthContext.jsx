// src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';

// Création du contexte d'authentification
const AuthContext = createContext(null);

// Hook personnalisé pour utiliser le contexte
export const useAuth = () => useContext(AuthContext);

// Fournisseur du contexte
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Fonction pour vérifier si un token est au format JWT valide
  const isValidJwtFormat = (token) => {
    if (!token) return false;
    // Un JWT valide a 3 parties séparées par des points
    const parts = token.split('.');
    return parts.length === 3;
  };

  // Vérification de l'authentification au chargement
  useEffect(() => {
    const verifyAuth = async () => {
      console.log("=== VÉRIFICATION D'AUTHENTIFICATION DÉMARRÉE ===");
      setIsLoading(true);
      const token = localStorage.getItem('token');
      
      console.log("Token trouvé dans localStorage:", token ? `${token.substring(0, 20)}...` : "Aucun");
      
      // Vérification du format JWT
      if (token) {
        const isJwtValid = isValidJwtFormat(token);
        console.log("Format JWT valide:", isJwtValid ? "Oui" : "Non");
        
        if (!isJwtValid) {
          console.log("ATTENTION: Le token stocké n'est pas au format JWT valide, suppression du token");
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setIsAuthenticated(false);
          setIsLoading(false);
          console.log("=== VÉRIFICATION D'AUTHENTIFICATION TERMINÉE (TOKEN INVALIDE) ===");
          return;
        }
      }
      
      if (!token) {
        console.log("Aucun token trouvé dans localStorage, utilisateur non authentifié");
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      try {
        console.log("Tentative de vérification du token...");
        // Si vous avez une API d'authentification, utilisez-la ici
        // Exemple avec une vraie API:
        /*
        console.log("Envoi d'une requête à /api/auth/check pour vérifier le token");
        const response = await fetch('/api/auth/check', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        });
        console.log("Réponse reçue, statut:", response.status);

        const data = await response.json();
        console.log("Données de réponse:", data);
        
        if (response.ok && data.authenticated) {
          console.log("Token validé par le serveur, authentification réussie");
          setIsAuthenticated(true);
          setUser(data.user);
          console.log("Données utilisateur définies:", data.user);
        } else {
          console.log("Token rejeté par le serveur, suppression des informations d'authentification");
          localStorage.removeItem('token');
          document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
          setIsAuthenticated(false);
        }
        */
        
        // Pour une version simplifiée, utilisons juste le localStorage
        const userData = localStorage.getItem('user');
        console.log("Données utilisateur trouvées dans localStorage:", userData ? "Oui" : "Non");
        
        if (userData) {
          const parsedUserData = JSON.parse(userData);
          console.log("Données utilisateur parsées:", parsedUserData);
          setIsAuthenticated(true);
          setUser(parsedUserData);
          console.log("Authentification réussie, état mis à jour (isAuthenticated=true)");
        } else {
          console.log("Aucune donnée utilisateur trouvée, état d'authentification défini à false");
          setIsAuthenticated(false);
        }
        
      } catch (error) {
        console.error("ERREUR lors de la vérification du token:", error);
        console.log("Authentification échouée en raison d'une erreur, état défini à false");
        setIsAuthenticated(false);
      } finally {
        console.log("Vérification d'authentification terminée, isLoading défini à false");
        setIsLoading(false);
      }
      console.log("=== VÉRIFICATION D'AUTHENTIFICATION TERMINÉE ===");
    };

    verifyAuth();
  }, []);

  // Fonction de déconnexion
  const logout = () => {
    console.log("=== DÉCONNEXION INITIÉE ===");
    console.log("Suppression du token de localStorage");
    localStorage.removeItem('token');
    console.log("Suppression des données utilisateur de localStorage");
    localStorage.removeItem('user');
    console.log("Suppression du cookie token");
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    console.log("Mise à jour de l'état d'authentification à false");
    setIsAuthenticated(false);
    console.log("Effacement des données utilisateur");
    setUser(null);
    console.log("=== DÉCONNEXION TERMINÉE ===");
  };

  // Fonction de connexion
  const login = (token, userData) => {
    console.log("=== CONNEXION INITIÉE ===");
    console.log("Token reçu:", token ? `${token.substring(0, 20)}...` : "Invalide");
    console.log("Données utilisateur reçues:", userData);
    
    // Vérification du format JWT
    if (!token || !isValidJwtFormat(token)) {
      console.error("ERREUR: Tentative de connexion avec un token invalide ou au mauvais format JWT");
      console.log("Format JWT valide:", isValidJwtFormat(token) ? "Oui" : "Non");
      return;
    }
    
    console.log("Stockage du token dans localStorage");
    localStorage.setItem('token', token);
    
    console.log("Stockage des données utilisateur dans localStorage");
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Définir le cookie avec SameSite=Lax
    const expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + 24 * 60 * 60 * 1000); // 24 heures
    console.log("Définition du cookie avec expiration:", expiryDate.toUTCString());
    document.cookie = `token=${token}; path=/; expires=${expiryDate.toUTCString()}; SameSite=Lax`;
    
    console.log("Mise à jour de l'état d'authentification à true");
    setIsAuthenticated(true);
    console.log("Mise à jour des données utilisateur dans l'état");
    setUser(userData);
    
    // Vérification que le token est bien stocké
    const storedToken = localStorage.getItem('token');
    console.log("Vérification que le token est correctement stocké:", 
      storedToken === token ? "OK" : "ÉCHEC");
    
    console.log("=== CONNEXION TERMINÉE ===");
  };

  // Fonction pour remplacer un token de démo par un JWT valide (temporaire)
  const generateValidJwtToken = (userId = 1, username = 'mvaertan', role = 'user') => {
    console.log("=== GÉNÉRATION D'UN TOKEN JWT VALIDE TEMPORAIRE ===");
    // Structure d'un JWT basique (header.payload.signature)
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ 
      id: userId, 
      username: username, 
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 heures
    }));
    const signature = btoa('signature_temporaire_pour_tests'); // Fausse signature
    
    const token = `${header}.${payload}.${signature}`;
    console.log("Token JWT généré:", token.substring(0, 20) + '...');
    
    return token;
  };

  // Remplacer un token de démo par un JWT valide si nécessaire
  const fixDemoToken = () => {
    const currentToken = localStorage.getItem('token');
    if (currentToken && currentToken.startsWith('demo_token_')) {
      console.log("Token de démo détecté, remplacement par un JWT valide temporaire");
      const validToken = generateValidJwtToken();
      localStorage.setItem('token', validToken);
      console.log("Token de démo remplacé avec succès");
      return true;
    }
    return false;
  };

  // Exécuter la correction du token au chargement
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const tokenFixed = fixDemoToken();
      if (tokenFixed) {
        // Relancer la vérification d'authentification si le token a été corrigé
        console.log("Rechargement de la page pour appliquer le nouveau token");
        window.location.reload();
      }
    }
  }, [isLoading, isAuthenticated]);

  // Valeur du contexte
  const value = {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    generateValidJwtToken // Exposer la fonction pour des tests
  };

  console.log("État actuel d'authentification:", { 
    isAuthenticated, 
    isLoading, 
    hasUser: !!user 
  });

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};