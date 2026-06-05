// src/components/billing/BillingLinkEmailModal.jsx
//
// Modale de composition de l'email d'envoi du lien de paiement (maintenance + abonnement).
// - corps éditable (textarea) pré-rempli + choix d'un modèle de texte (presets)
// - les conditions PDF sont jointes automatiquement (case à cocher pour les retirer)
// - possibilité d'ajouter / retirer des pièces jointes
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiSend, FiPaperclip, FiTrash2, FiFileText } from 'react-icons/fi';

// Modèles de texte par défaut (le {client} est remplacé à la sélection).
const DEFAULT_PRESETS = [
  {
    label: 'Standard',
    text: "Bonjour {client},\n\nComme convenu, voici le lien pour mettre en place le paiement. Vous trouverez les conditions détaillées en pièce jointe.\n\nBien à vous,"
  },
  {
    label: 'Chaleureux',
    text: "Bonjour {client},\n\nRavi de démarrer avec vous ! Voici le lien de paiement ci-dessous, et le détail des conditions en pièce jointe. N'hésitez pas si vous avez la moindre question.\n\nÀ très vite,"
  },
  {
    label: 'Concis',
    text: "Bonjour {client},\n\nVoici votre lien de paiement. Conditions en pièce jointe.\n\nBien à vous,"
  }
];

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const base64 = String(result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const BillingLinkEmailModal = ({
  isOpen,
  onClose,
  onSend,
  title = "Envoyer le lien de paiement",
  clientName = '',
  defaultMessage = '',
  conditionsLabel = 'Conditions (PDF)',
  presets = DEFAULT_PRESETS
}) => {
  const [message, setMessage] = useState('');
  const [includeConditions, setIncludeConditions] = useState(true);
  const [attachments, setAttachments] = useState([]); // { filename, contentBase64, contentType }
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage(defaultMessage || '');
      setIncludeConditions(true);
      setAttachments([]);
      setSending(false);
    }
  }, [isOpen, defaultMessage]);

  const applyPreset = (text) => {
    setMessage((text || '').replace(/\{client\}/g, clientName || ''));
  };

  const handleAddFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    const mapped = await Promise.all(
      files.map(async (f) => ({
        filename: f.name,
        contentBase64: await fileToBase64(f),
        contentType: f.type || 'application/octet-stream'
      }))
    );
    setAttachments((prev) => [...prev, ...mapped]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    try {
      setSending(true);
      await onSend({ message, includeConditions, attachments });
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden"
            style={{ maxHeight: '90dvh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700 shrink-0 bg-gray-900">
              <h2 className="text-xl font-bold text-white">{title}</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <FiX size={22} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Modèles de texte */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">Modèle de texte</label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.text)}
                      className="px-3 py-1.5 text-sm bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-lg transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corps de l'email */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Message de l'email</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={7}
                  placeholder="Votre message..."
                  className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
                />
                <p className="text-xs text-gray-500 mt-1">Le lien de paiement et votre signature sont ajoutés automatiquement.</p>
              </div>

              {/* Conditions PDF */}
              <label className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeConditions}
                  onChange={(e) => setIncludeConditions(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm text-gray-300 flex items-center gap-2">
                  <FiFileText className="text-indigo-300" />
                  Joindre automatiquement : <strong className="text-white">{conditionsLabel}</strong>
                </span>
              </label>

              {/* Pièces jointes supplémentaires */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-300">Pièces jointes supplémentaires</label>
                  <label className="px-3 py-1.5 text-sm bg-gray-700/60 hover:bg-gray-700 text-gray-200 rounded-lg cursor-pointer flex items-center gap-1">
                    <FiPaperclip size={14} />
                    Ajouter
                    <input type="file" multiple className="hidden" onChange={handleAddFiles} />
                  </label>
                </div>
                {attachments.length > 0 && (
                  <ul className="space-y-2">
                    {attachments.map((a, idx) => (
                      <li key={idx} className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-300 truncate">{a.filename}</span>
                        <button onClick={() => removeAttachment(idx)} className="text-red-400 hover:text-red-300" title="Retirer">
                          <FiTrash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-700 shrink-0 bg-gray-900">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border-2 border-white/20 text-white hover:bg-white/10 rounded-lg font-medium transition-all"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <FiSend size={16} />
                {sending ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BillingLinkEmailModal;
