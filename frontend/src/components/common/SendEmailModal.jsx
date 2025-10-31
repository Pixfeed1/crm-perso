// src/components/common/SendEmailModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMail, FiX, FiSend, FiAlertCircle } from 'react-icons/fi';

const SendEmailModal = ({
  isOpen,
  onClose,
  onSend,
  defaultEmail = '',
  documentType = 'devis', // 'devis' ou 'facture'
  documentNumber = '',
  clientName = ''
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [customMessage, setCustomMessage] = useState('');
  const [ccToSelf, setCcToSelf] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmail(defaultEmail);
      setCustomMessage('');
      setCcToSelf(false);
      setError('');
    }
  }, [isOpen, defaultEmail]);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSend = async () => {
    setError('');

    // Validation
    if (!email) {
      setError('Veuillez saisir une adresse email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Adresse email invalide');
      return;
    }

    setIsLoading(true);

    try {
      await onSend({
        recipientEmail: email,
        customMessage: customMessage,
        ccToSelf: ccToSelf
      });
      onClose();
    } catch (error) {
      setError(error.message || 'Erreur lors de l\'envoi de l\'email');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const docLabel = documentType === 'devis' ? 'devis' : 'facture';
  const docLabelCap = documentType === 'devis' ? 'Devis' : 'Facture';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className="
            bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900
            border border-indigo-500/30
            rounded-2xl shadow-2xl
            max-w-lg w-full
            overflow-hidden
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 pb-4 border-b border-gray-700/50">
            <div className="flex items-start gap-4">
              {/* Icône */}
              <div className="bg-indigo-500/20 text-indigo-400 p-3 rounded-xl flex-shrink-0">
                <FiMail className="text-2xl" />
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-white mb-1">
                  Envoyer le {docLabel}
                </h3>
                <p className="text-gray-400 text-sm">
                  {documentNumber} - {clientName}
                </p>
              </div>

              {/* Bouton fermer */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                disabled={isLoading}
              >
                <FiX className="text-xl" />
              </motion.button>
            </div>
          </div>

          {/* Corps */}
          <div className="p-6 space-y-4">
            {/* Email destinataire */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Adresse email du destinataire *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="client@exemple.com"
                className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                disabled={isLoading}
              />
            </div>

            {/* Message personnalisé */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Message personnalisé (optionnel)
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder={`Ajoutez un message personnel qui sera inclus dans l'email...`}
                rows="4"
                className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                disabled={isLoading}
              />
            </div>

            {/* Option copie */}
            <div className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
              <input
                type="checkbox"
                id="ccToSelf"
                checked={ccToSelf}
                onChange={(e) => setCcToSelf(e.target.checked)}
                className="w-4 h-4 text-indigo-600 bg-gray-800 border-gray-600 rounded focus:ring-indigo-500 focus:ring-2"
                disabled={isLoading}
              />
              <label htmlFor="ccToSelf" className="text-sm text-gray-300 cursor-pointer">
                M'envoyer une copie de l'email
              </label>
            </div>

            {/* Info */}
            <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/30">
              <p className="text-xs text-indigo-300 leading-relaxed">
                Le {docLabel} sera envoyé en pièce jointe au format PDF avec votre signature personnalisée.
              </p>
            </div>

            {/* Erreur */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/10 rounded-lg border border-red-500/30 flex items-start gap-2"
              >
                <FiAlertCircle className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </motion.div>
            )}
          </div>

          {/* Footer avec boutons */}
          <div className="px-6 py-4 bg-black/20 border-t border-gray-700/50 flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border-2 border-gray-600 text-gray-300 hover:bg-gray-700/30 hover:border-gray-500 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Envoi...</span>
                </>
              ) : (
                <>
                  <FiSend className="w-4 h-4" />
                  <span>Envoyer</span>
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SendEmailModal;
