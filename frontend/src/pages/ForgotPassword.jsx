// src/pages/ForgotPassword.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const ForgotPassword = () => {
  const [username, setUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username) {
      setError('Veuillez entrer votre nom d\'utilisateur');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username })
      });

      const data = await response.json();

      if (response.ok) {
        // Afficher le token (dans un vrai système, on enverrait par email)
        setResetToken(data.resetToken);
      } else {
        setError(data.message || 'Erreur lors de la génération du token');
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
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '2rem',
        position: 'relative',
        zIndex: 10
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            background: 'rgba(31, 41, 55, 0.7)',
            backdropFilter: 'blur(10px)',
            borderRadius: '1rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '2.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Mot de passe oublié
          </h1>

          <p style={{
            textAlign: 'center',
            color: '#9ca3af',
            marginBottom: '2rem',
            fontSize: '0.875rem'
          }}>
            {resetToken ? 'Token de réinitialisation généré !' : 'Entrez votre nom d\'utilisateur'}
          </p>

          {!resetToken ? (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#9ca3af'
                }}>
                  Nom d'utilisateur
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(17, 24, 39, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.5rem',
                    color: '#f3f4f6',
                    outline: 'none',
                    transition: 'border-color 0.3s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                />
                {error && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '0.5rem',
                    color: '#fca5a5',
                    fontSize: '0.875rem'
                  }}>
                    {error}
                  </div>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #6d28d9, #7c3aed)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                {isLoading ? 'Génération...' : 'Générer un token de réinitialisation'}
              </motion.button>

              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <a
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/login');
                  }}
                  style={{
                    fontSize: '0.875rem',
                    color: '#a78bfa',
                    textDecoration: 'none'
                  }}
                >
                  Retour à la connexion
                </a>
              </div>
            </form>
          ) : (
            <div>
              <div style={{
                padding: '1rem',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem'
              }}>
                <p style={{
                  color: '#6ee7b7',
                  marginBottom: '1rem',
                  fontSize: '0.875rem'
                }}>
                  Copiez ce token et utilisez-le pour réinitialiser votre mot de passe :
                </p>
                <div style={{
                  padding: '1rem',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '0.5rem',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  wordBreak: 'break-all',
                  color: '#fff'
                }}>
                  {resetToken}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resetToken);
                    alert('Token copié dans le presse-papier !');
                  }}
                  style={{
                    marginTop: '1rem',
                    width: '100%',
                    padding: '0.5rem',
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '0.5rem',
                    color: '#6ee7b7',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  📋 Copier le token
                </button>
              </div>

              <p style={{
                fontSize: '0.75rem',
                color: '#9ca3af',
                marginBottom: '1.5rem',
                textAlign: 'center'
              }}>
                Ce token est valable 1 heure
              </p>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/reset-password')}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #6d28d9, #7c3aed)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Réinitialiser mon mot de passe
              </motion.button>

              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <a
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/login');
                  }}
                  style={{
                    fontSize: '0.875rem',
                    color: '#a78bfa',
                    textDecoration: 'none'
                  }}
                >
                  Retour à la connexion
                </a>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
};

export default ForgotPassword;
