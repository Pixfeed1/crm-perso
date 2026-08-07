// src/components/common/SendEmailModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMail, FiX, FiSend, FiAlertCircle, FiClock, FiCalendar } from 'react-icons/fi';

const SendEmailModal = ({
  isOpen,
  onClose,
  onSend,
  onSchedule, // Nouvelle prop pour programmer l'envoi
  defaultEmail = '',
  documentType = 'devis', // 'devis' ou 'facture'
  documentNumber = '',
  clientName = '',
  allowScheduling = true // Permettre la programmation par défaut
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [customMessage, setCustomMessage] = useState('');
  const [ccToSelf, setCcToSelf] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Nouvelles variables pour la programmation
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  useEffect(() => {
    if (isOpen) {
      setEmail(defaultEmail);
      setCustomMessage('');
      setCcToSelf(false);
      setError('');
      setIsScheduled(false);
      // Pré-remplir avec demain à 9h
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setScheduledDate(tomorrow.toISOString().split('T')[0]);
      setScheduledTime('09:00');
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

    // Validation de la date de programmation
    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        setError('Veuillez sélectionner une date et une heure');
        return;
      }
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledDateTime <= new Date()) {
        setError('La date de programmation doit être dans le futur');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isScheduled && onSchedule) {
        // Programmer l'envoi
        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        await onSchedule({
          recipientEmail: email,
          customMessage: customMessage,
          ccToSelf: ccToSelf,
          scheduledAt: scheduledAt
        });
      } else {
        // Envoi immédiat
        await onSend({
          recipientEmail: email,
          customMessage: customMessage,
          ccToSelf: ccToSelf
        });
      }
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
            panel-bg
            border border-indigo-500/30
            rounded-2xl shadow-2xl
            max-w-lg w-full
            overflow-hidden
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 pb-4 border-b border-border/50">
            <div className="flex items-start gap-4">
              {/* Icône */}
              <div className="bg-indigo-500/20 text-indigo-400 p-3 rounded-xl flex-shrink-0">
                <FiMail className="text-2xl" />
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-text-primary mb-1">
                  Envoyer le {docLabel}
                </h3>
                <p className="text-text-muted text-sm">
                  {documentNumber} - {clientName}
                </p>
              </div>

              {/* Bouton fermer */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
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
              <label className="block text-sm font-medium text-text-secondary mb-2">
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
                className="w-full px-4 py-2.5 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
                disabled={isLoading}
              />
            </div>

            {/* Message personnalisé */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Message personnalisé (optionnel)
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder={`Ajoutez un message personnel qui sera inclus dans l'email...`}
                rows="4"
                className="w-full px-4 py-2.5 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                disabled={isLoading}
              />
            </div>

            {/* Option copie */}
            <div className="flex items-center gap-3 p-3 bg-surface/30 rounded-lg border border-border/50">
              <input
                type="checkbox"
                id="ccToSelf"
                checked={ccToSelf}
                onChange={(e) => setCcToSelf(e.target.checked)}
                className="w-4 h-4 text-indigo-600 bg-surface border-border-strong rounded focus:ring-indigo-500 focus:ring-2"
                disabled={isLoading}
              />
              <label htmlFor="ccToSelf" className="text-sm text-text-secondary cursor-pointer">
                M'envoyer une copie de l'email
              </label>
            </div>

            {/* Option programmation */}
            {allowScheduling && onSchedule && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-surface/30 rounded-lg border border-border/50">
                  <input
                    type="checkbox"
                    id="scheduleEmail"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 bg-surface border-border-strong rounded focus:ring-indigo-500 focus:ring-2"
                    disabled={isLoading}
                  />
                  <label htmlFor="scheduleEmail" className="text-sm text-text-secondary cursor-pointer flex items-center gap-2">
                    <FiClock className="text-indigo-400" />
                    Programmer l'envoi pour plus tard
                  </label>
                </div>

                {/* Sélecteurs date/heure */}
                <AnimatePresence>
                  {isScheduled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex gap-3 p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/30">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-indigo-300 mb-1">
                            <FiCalendar className="inline mr-1" /> Date
                          </label>
                          <input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 bg-surface/50 border border-indigo-500/30 rounded-lg text-text-primary text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            disabled={isLoading}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-indigo-300 mb-1">
                            <FiClock className="inline mr-1" /> Heure
                          </label>
                          <input
                            type="time"
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="w-full px-3 py-2 bg-surface/50 border border-indigo-500/30 rounded-lg text-text-primary text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Info */}
            <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/30">
              <p className="text-xs text-indigo-300 leading-relaxed">
                {isScheduled
                  ? `Le ${docLabel} sera envoyé automatiquement le ${scheduledDate ? new Date(scheduledDate + 'T' + scheduledTime).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '...'}.`
                  : `Le ${docLabel} sera envoyé en pièce jointe au format PDF avec votre signature personnalisée.`
                }
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
          <div className="px-6 py-4 bg-black/20 border-t border-border/50 flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 border-2 border-border-strong text-text-secondary hover:bg-surface-strong/30 hover:border-gray-500 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={isLoading}
              className={`flex-1 px-4 py-2.5 ${isScheduled ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{isScheduled ? 'Programmation...' : 'Envoi...'}</span>
                </>
              ) : (
                <>
                  {isScheduled ? <FiClock className="w-4 h-4" /> : <FiSend className="w-4 h-4" />}
                  <span>{isScheduled ? 'Programmer' : 'Envoyer'}</span>
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
