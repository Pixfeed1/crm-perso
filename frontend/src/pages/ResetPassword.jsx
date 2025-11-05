// src/pages/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheckCircle } from 'react-icons/fi';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (!tokenFromUrl) {
      setError('Token de réinitialisation manquant ou invalide');
    } else {
      setToken(tokenFromUrl);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validation
    if (!password || !confirmPassword) {
      setError('Veuillez remplir tous les champs');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        // Redirection automatique après 3 secondes
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(data.message || 'Une erreur est survenue');
      }
    } catch (error) {
      console.error('Erreur:', error);
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
          className="bg-gray-800/70 backdrop-blur-md rounded-2xl border border-white/10 p-6 sm:p-8 md:p-10 shadow-2xl relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Effet de gradient décoratif */}
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
              className="text-gray-400 text-sm sm:text-base"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              Nouveau mot de passe
            </motion.p>
          </div>

          {!success ? (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {/* Champ Nouveau mot de passe */}
              <div>
                <label htmlFor="password" className="block text-gray-400 text-sm mb-2">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  className="w-full px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg bg-gray-900/70 border border-white/10 text-gray-100 text-sm sm:text-base focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/30 transition-all"
                  required
                  autoComplete="new-password"
                />
              </div>

              {/* Champ Confirmer le mot de passe */}
              <div>
                <label htmlFor="confirmPassword" className="block text-gray-400 text-sm mb-2">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retapez votre mot de passe"
                  className="w-full px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg bg-gray-900/70 border border-white/10 text-gray-100 text-sm sm:text-base focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/30 transition-all"
                  required
                  autoComplete="new-password"
                />
                {error && (
                  <div className="text-red-400 text-xs sm:text-sm mt-2">
                    {error}
                  </div>
                )}
              </div>

              {/* Bouton de réinitialisation */}
              <motion.button
                type="submit"
                disabled={isLoading || !token}
                className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg font-semibold text-sm sm:text-base hover:from-purple-700 hover:to-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-purple-500/50 relative overflow-hidden"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Effet de brillance au hover */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>

                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                    Réinitialisation...
                  </div>
                ) : 'Réinitialiser le mot de passe'}
              </motion.button>

              {/* Lien retour */}
              <div className="text-center mt-4">
                <a
                  href="/login"
                  className="text-xs sm:text-sm text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/login');
                  }}
                >
                  ← Retour à la connexion
                </a>
              </div>
            </form>
          ) : (
            <div className="text-center">
              {/* Icône succès */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5 }}
                className="flex justify-center mb-4 sm:mb-6"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                  <FiCheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-green-400" />
                </div>
              </motion.div>

              {/* Message succès */}
              <h3 className="text-xl sm:text-2xl font-semibold text-green-400 mb-3 sm:mb-4">
                Mot de passe réinitialisé !
              </h3>
              <p className="text-gray-400 text-sm sm:text-base mb-6 sm:mb-8">
                Votre mot de passe a été modifié avec succès.
                <br className="hidden sm:block" />
                <span className="block mt-1 sm:inline sm:mt-0"> Redirection vers la page de connexion...</span>
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ResetPassword;
