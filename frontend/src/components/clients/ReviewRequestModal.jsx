// src/components/clients/ReviewRequestModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiSend, FiAlertCircle, FiCheck, FiStar, FiMail } from 'react-icons/fi';
import { FaGoogle, FaFacebook, FaInstagram } from 'react-icons/fa';
import { reviewRequestsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ReviewRequestModal = ({ isOpen, onClose, client, contact }) => {
  const { toast } = useToast();
  const [selectedPlatforms, setSelectedPlatforms] = useState(['google']);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Charger le template par défaut quand les plateformes changent
  useEffect(() => {
    if (isOpen && selectedPlatforms.length > 0) {
      loadDefaultTemplate();
    }
  }, [isOpen, selectedPlatforms, client, contact]);

  // Initialiser les données du contact
  useEffect(() => {
    if (isOpen) {
      if (contact) {
        setContactEmail(contact.email || '');
        setContactName(contact.name || '');
      } else if (client) {
        setContactEmail(client.email || '');
        setContactName(client.name || '');
      }
    }
  }, [isOpen, client, contact]);

  const loadDefaultTemplate = async () => {
    try {
      setLoadingTemplate(true);
      const clientName = client?.name || '';
      const name = contact?.name || client?.name || '';

      const response = await reviewRequestsAPI.getTemplate(
        selectedPlatforms,
        clientName,
        name
      );

      setEmailSubject(response.template.subject);
      setEmailBody(response.template.body);
    } catch (error) {
      console.error('Erreur lors du chargement du template:', error);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const togglePlatform = (platform) => {
    setSelectedPlatforms(prev => {
      if (prev.includes(platform)) {
        return prev.filter(p => p !== platform);
      } else {
        return [...prev, platform];
      }
    });
  };

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSend = async () => {
    // Validation
    if (!contactEmail) {
      toast.error('Veuillez saisir une adresse email');
      return;
    }

    if (!validateEmail(contactEmail)) {
      toast.error('Adresse email invalide');
      return;
    }

    if (selectedPlatforms.length === 0) {
      toast.error('Veuillez sélectionner au moins une plateforme');
      return;
    }

    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error('Le sujet et le message sont requis');
      return;
    }

    try {
      setLoading(true);

      await reviewRequestsAPI.send({
        client_id: client?.id || null,
        contact_name: contactName,
        contact_email: contactEmail,
        platforms: selectedPlatforms,
        custom_subject: emailSubject,
        custom_body: emailBody
      });

      toast.success('Demande d\'avis enregistrée avec succès !');
      onClose();
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      toast.error('Erreur lors de l\'envoi de la demande d\'avis');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const platforms = [
    { id: 'google', name: 'Google My Business', icon: FaGoogle, color: 'text-red-400', bgColor: 'bg-red-500/20' },
    { id: 'facebook', name: 'Facebook', icon: FaFacebook, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    { id: 'instagram', name: 'Instagram', icon: FaInstagram, color: 'text-pink-400', bgColor: 'bg-pink-500/20' }
  ];

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
          className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-indigo-500/30 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gray-900/90 backdrop-blur-sm p-6 pb-4 border-b border-gray-700/50 flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="bg-indigo-500/20 text-indigo-400 p-3 rounded-xl">
                <FiStar className="text-2xl" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Demander un avis
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {client?.name || 'Client'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
            >
              <FiX className="text-xl" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Informations du contact */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FiMail className="text-indigo-400" />
                Destinataire
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom du contact
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    placeholder="Nom du contact"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    placeholder="email@exemple.com"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Sélection des plateformes */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">
                Plateformes d'avis
              </h3>

              <div className="grid grid-cols-3 gap-4">
                {platforms.map((platform) => {
                  const Icon = platform.icon;
                  const isSelected = selectedPlatforms.includes(platform.id);

                  return (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      className={`
                        p-4 rounded-xl border-2 transition-all
                        ${isSelected
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                        }
                      `}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className={`${platform.bgColor} p-3 rounded-lg`}>
                          <Icon className={`text-2xl ${platform.color}`} />
                        </div>
                        <span className="text-sm font-medium text-white text-center">
                          {platform.name}
                        </span>
                        {isSelected && (
                          <FiCheck className="text-indigo-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Template d'email */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  Message personnalisé
                </h3>
                <button
                  onClick={loadDefaultTemplate}
                  disabled={loadingTemplate}
                  className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-2"
                >
                  {loadingTemplate ? 'Chargement...' : 'Réinitialiser le template'}
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sujet de l'email <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Sujet de l'email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Corps du message <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  placeholder="Corps de l'email"
                />
                <p className="text-xs text-gray-400 mt-2">
                  Variables disponibles : {'{nom_client}'}, {'{nom_contact}'}, {'{société}'}
                </p>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex gap-3">
              <FiAlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-200">
                La demande sera enregistrée dans votre historique. Pour l'envoi automatique par email,
                configurez vos paramètres SMTP dans <strong>Paramètres → Configuration emails</strong>.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-900/90 backdrop-blur-sm p-6 pt-4 border-t border-gray-700/50 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              onClick={handleSend}
              disabled={loading || !contactEmail || selectedPlatforms.length === 0}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Envoi...</span>
                </>
              ) : (
                <>
                  <FiSend />
                  <span>Envoyer la demande</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReviewRequestModal;
