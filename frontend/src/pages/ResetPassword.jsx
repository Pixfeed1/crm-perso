// src/pages/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

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
    <>
      {/* CSS injecté - même style que Login */}
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

        .login-form button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
        }

        .back-link {
          text-align: center;
          margin-top: 1.5rem;
        }

        .back-link a {
          color: #a78bfa;
          text-decoration: none;
          font-size: 0.9rem;
          transition: color 0.3s;
        }

        .back-link a:hover {
          color: #c4b5fd;
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
              Nouveau mot de passe
            </motion.p>
          </div>

          {!success ? (
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="password">Nouveau mot de passe</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retapez votre mot de passe"
                  required
                  autoComplete="new-password"
                />
                {error && <div className="error-message">{error}</div>}
              </div>

              <motion.button
                type="submit"
                disabled={isLoading || !token}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin mr-2"></div>
                    Réinitialisation...
                  </div>
                ) : 'Réinitialiser le mot de passe'}
              </motion.button>

              <div className="back-link">
                <a
                  href="/login"
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
            <div style={{ textAlign: 'center' }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{ fontSize: '3rem', marginBottom: '1rem' }}
              >
                ✅
              </motion.div>
              <h3 style={{ color: '#34d399', marginBottom: '1rem' }}>Mot de passe réinitialisé !</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Votre mot de passe a été modifié avec succès.
                <br />
                Redirection vers la page de connexion...
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
};

export default ResetPassword;
