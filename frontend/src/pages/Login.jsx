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

  // Rediriger si deja connecte
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username || !password) {
      setError('Veuillez entrer un identifiant et un mot de passe');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
        navigate('/dashboard');
      } else {
        setError(data.message || 'Identifiants incorrects');
      }
    } catch (error) {
      console.error("Erreur de connexion:", error);
      setError('Erreur de connexion au serveur');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center overflow-hidden relative px-4 sm:px-6 lg:px-8">
      {/* Effet visuel des orbes - responsive */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          className="absolute w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 rounded-full opacity-30"
          style={{
            top: '20%',
            left: '15%',
            background: 'rgba(139, 92, 246, 0.5)',
            filter: 'blur(60px)'
          }}
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
          className="absolute w-40 h-40 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-full opacity-30"
          style={{
            top: '60%',
            left: '70%',
            background: 'rgba(236, 72, 153, 0.5)',
            filter: 'blur(60px)'
          }}
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
          className="absolute w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 rounded-full opacity-30"
          style={{
            top: '80%',
            left: '30%',
            background: 'rgba(52, 211, 153, 0.5)',
            filter: 'blur(60px)'
          }}
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

      {/* Contenu principal - responsive */}
      <div className="w-full max-w-sm sm:max-w-md relative z-10">
        <motion.div
          className="bg-surface/70 backdrop-blur-md rounded-2xl border border-white/10 p-6 sm:p-8 md:p-10 shadow-2xl relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Effet de gradient decoratif */}
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-transparent via-transparent to-purple-600/10 transform rotate-30 pointer-events-none" />

          {/* Header */}
          <div className="text-center mb-6 sm:mb-8 relative">
            <motion.h1
              className="text-3xl sm:text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              MCRM
            </motion.h1>
            <motion.p
              className="text-text-muted text-sm sm:text-base"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              Connectez-vous pour acceder a votre espace
            </motion.p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Champ Identifiant */}
            <div>
              <label htmlFor="username" className="block text-text-muted text-sm mb-2">
                Identifiant
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg bg-surface-muted/70 border border-white/10 text-gray-100 text-sm sm:text-base focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/30 transition-all"
                required
                autoComplete="username"
              />
            </div>

            {/* Champ Mot de passe */}
            <div>
              <label htmlFor="password" className="block text-text-muted text-sm mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg bg-surface-muted/70 border border-white/10 text-gray-100 text-sm sm:text-base focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/30 transition-all"
                required
                autoComplete="current-password"
              />
              {error && (
                <div className="text-red-400 text-xs sm:text-sm mt-2">
                  {error}
                </div>
              )}
            </div>

            {/* Lien mot de passe oublie */}
            <div className="text-right">
              <a
                href="/forgot-password"
                className="text-xs sm:text-sm text-purple-400 hover:text-purple-300 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/forgot-password');
                }}
              >
                Mot de passe oublie ?
              </a>
            </div>

            {/* Bouton de connexion */}
            <motion.button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg font-semibold text-sm sm:text-base hover:from-purple-700 hover:to-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-purple-500/50 relative overflow-hidden"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Effet de brillance au hover */}
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>

              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                  Connexion en cours...
                </div>
              ) : 'Se connecter'}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
