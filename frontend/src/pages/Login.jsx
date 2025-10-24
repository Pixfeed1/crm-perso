// src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  // Log initial
  console.log("=== RENDU DU COMPOSANT LOGIN ===");
  console.log("État initial:", { 
    usernameLength: username.length, 
    passwordEntered: !!password, 
    hasError: !!error, 
    isLoading, 
    isAuthenticated 
  });

  // Rediriger si déjà connecté
  useEffect(() => {
    console.log("useEffect - Vérification d'authentification");
    console.log("État d'authentification actuel:", isAuthenticated);
    
    if (isAuthenticated) {
      console.log("Utilisateur déjà authentifié, redirection vers dashboard");
      navigate('/dashboard');
    } else {
      console.log("Utilisateur non authentifié, affichage du formulaire de connexion");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    console.log("=== SOUMISSION DU FORMULAIRE DE CONNEXION ===");
    e.preventDefault();
    console.log("Identifiants soumis:", { username, passwordLength: password.length });
    
    setError('');
    setIsLoading(true);
    console.log("État mis à jour: isLoading=true, error=''");

    if (!username || !password) {
      console.log("Validation: Champs manquants détectés");
      setError('Veuillez entrer un identifiant et un mot de passe');
      setIsLoading(false);
      console.log("État mis à jour: isLoading=false, error='Veuillez entrer un identifiant et un mot de passe'");
      return;
    }

    try {
      console.log("Validation réussie, tentative de connexion...");
      console.log("Envoi de la requête d'authentification à /api/auth/login");
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ username, password })
      });
      
      console.log("Réponse reçue du serveur:", { 
        status: response.status, 
        ok: response.ok 
      });

      const data = await response.json();
      console.log("Données de réponse:", { 
        hasToken: !!data.token, 
        hasUserData: !!data.user,
        message: data.message || 'Pas de message' 
      });
      
      if (response.ok) {
        console.log("Connexion réussie côté serveur, appel de la fonction login");
        login(data.token, data.user);
        console.log("Redirection vers le dashboard");
        navigate('/dashboard');
      } else {
        console.log("Échec de la connexion côté serveur:", data.message);
        setError(data.message || 'Identifiants incorrects');
      }
    } catch (error) {
      console.error("ERREUR lors de la tentative de connexion:", error);
      setError('Erreur de connexion au serveur');
    } finally {
      setIsLoading(false);
      console.log("État mis à jour: isLoading=false");
    }
  };

  // Log avant rendu
  console.log("Préparation du rendu avec état:", { 
    usernameLength: username.length, 
    passwordEntered: !!password, 
    hasError: !!error, 
    errorMessage: error,
    isLoading, 
    isAuthenticated 
  });

  return (
    <>
      {/* CSS injecté pour reproduire le style de login.html */}
      <style>{`
        :root {
          --primary-color: #6d28d9;
          --secondary-color: #7c3aed;
          --accent-color: #8b5cf6;
          --background-dark: #111827;
          --background-medium: #1f2937;
          --text-light: #f3f4f6;
          --text-dim: #9ca3af;
        }
        
        body {
          font-family: 'Poppins', sans-serif;
          background: linear-gradient(135deg, var(--background-dark), #312e81);
          color: var(--text-light);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          margin: 0;
          padding: 0;
        }
        
        .login-container {
          width: 100%;
          max-width: 420px;
          padding: 2rem;
          position: relative;
          z-index: 10;
        }
        
        .login-card {
          background: rgba(31, 41, 55, 0.7);
          backdrop-filter: blur(10px);
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2.5rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          position: relative;
        }
        
        .login-card::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            to bottom right,
            transparent,
            transparent,
            transparent,
            rgba(147, 51, 234, 0.1)
          );
          transform: rotate(30deg);
          pointer-events: none;
        }
        
        .login-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .login-header h1 {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          background: linear-gradient(to right, #f472b6, #8b5cf6);
          -webkit-background-clip: text;
          color: transparent;
        }
        
        .login-header p {
          color: var(--text-dim);
          font-size: 0.9rem;
        }
        
        .login-form .form-group {
          margin-bottom: 1.5rem;
        }
        
        .login-form label {
          display: block;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
          color: var(--text-dim);
        }
        
        .login-form input {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          background-color: rgba(17, 24, 39, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-light);
          font-size: 1rem;
          transition: all 0.3s;
        }
        
        .login-form input:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 0 2px rgba(109, 40, 217, 0.3);
        }
        
        .login-form button {
          width: 100%;
          padding: 0.75rem;
          background: linear-gradient(to right, var(--primary-color), var(--secondary-color));
          border: none;
          border-radius: 0.5rem;
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 1rem;
          position: relative;
          overflow: hidden;
        }
        
        .login-form button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent
          );
          transition: all 0.5s;
        }
        
        .login-form button:hover::before {
          left: 100%;
        }
        
        .login-form button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(109, 40, 217, 0.5);
        }
        
        .orbs {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 1;
        }
        
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          opacity: 0.3;
          animation: float 15s infinite ease-in-out;
        }
        
        .orb:nth-child(1) {
          top: 20%;
          left: 15%;
          width: 300px;
          height: 300px;
          background: rgba(139, 92, 246, 0.5);
          animation-delay: 0s;
        }
        
        .orb:nth-child(2) {
          top: 60%;
          left: 70%;
          width: 250px;
          height: 250px;
          background: rgba(236, 72, 153, 0.5);
          animation-delay: -5s;
        }
        
        .orb:nth-child(3) {
          top: 80%;
          left: 30%;
          width: 200px;
          height: 200px;
          background: rgba(52, 211, 153, 0.5);
          animation-delay: -10s;
        }
        
        @keyframes float {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-20px, 20px) rotate(5deg); }
          50% { transform: translate(10px, -10px) rotate(-5deg); }
          75% { transform: translate(-10px, -15px) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        
        .error-message {
          color: #f87171;
          font-size: 0.85rem;
          margin-top: 0.5rem;
          display: none;
        }
        
        .error-message.visible {
          display: block;
        }
      `}</style>

      {/* Effet visuel des orbes */}
      <div className="orbs">
        <motion.div 
          className="orb"
          animate={{
            x: [0, 20, -10, 15, 0],
            y: [0, -15, 10, -5, 0]
          }}
          transition={{
            repeat: Infinity,
            duration: 20,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="orb"
          animate={{
            x: [0, -15, 10, -20, 0],
            y: [0, 10, -15, 5, 0]
          }}
          transition={{
            repeat: Infinity,
            duration: 25,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="orb"
          animate={{
            x: [0, 10, -5, 15, 0],
            y: [0, -10, 15, -5, 0]
          }}
          transition={{
            repeat: Infinity,
            duration: 18,
            ease: "easeInOut"
          }}
        />
      </div>

      {/* Contenu principal */}
      <div className="login-container">
        <motion.div 
          className="login-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="login-header">
            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              MCRM
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              Connectez-vous pour accéder à votre espace
            </motion.p>
          </div>
          
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Identifiant</label>
              <input 
                type="text" 
                id="username" 
                name="username" 
                value={username}
                onChange={(e) => {
                  console.log("Mise à jour du champ username:", e.target.value);
                  setUsername(e.target.value);
                }}
                required 
                autoComplete="username"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <input 
                type="password" 
                id="password" 
                name="password" 
                value={password}
                onChange={(e) => {
                  console.log("Mise à jour du champ password (longueur):", e.target.value.length);
                  setPassword(e.target.value);
                }}
                required 
                autoComplete="current-password"
              />
              <div id="error-message" className={`error-message ${error ? 'visible' : ''}`}>
                {error}
              </div>
            </div>
            
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => console.log("Bouton de connexion cliqué")}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                  Connexion en cours...
                </div>
              ) : 'Se connecter'}
            </motion.button>

            {/* Lien Mot de passe oublié */}
            <div className="text-center mt-4">
              <a
                href="/forgot-password"
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/forgot-password');
                }}
              >
                Mot de passe oublié ?
              </a>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  );
};

export default Login;