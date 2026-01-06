// src/components/clients/EmailModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiMail, FiSend, FiUser, FiBriefcase, FiPaperclip, FiTrash2, FiFile } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';

const EmailModal = ({ isOpen, onClose, client }) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total

  // Réinitialiser le formulaire quand le modal s'ouvre
  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setMessage('');
      setAttachments([]);
    }
  }, [isOpen]);

  // Gestion de la sélection de fichiers
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);

    // Vérifier la taille de chaque fichier
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast.error(`Fichier(s) trop volumineux. Taille max: 10MB`);
      return;
    }

    // Vérifier la taille totale
    const currentSize = attachments.reduce((sum, file) => sum + file.size, 0);
    const newSize = files.reduce((sum, file) => sum + file.size, 0);
    if (currentSize + newSize > MAX_TOTAL_SIZE) {
      toast.error(`Taille totale max: 25MB`);
      return;
    }

    setAttachments([...attachments, ...files]);
    // Reset l'input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Supprimer une pièce jointe
  const handleRemoveAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // Formatter la taille du fichier
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSend = async () => {
    // Validation
    if (!subject.trim()) {
      toast.error('Veuillez saisir un objet');
      return;
    }

    if (!message.trim()) {
      toast.error('Veuillez saisir un message');
      return;
    }

    if (!client?.email) {
      toast.error('Ce client n\'a pas d\'adresse email');
      return;
    }

    setIsSending(true);

    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

      // Utiliser FormData pour envoyer les fichiers
      const formData = new FormData();
      formData.append('to', client.email);
      formData.append('subject', subject);
      formData.append('message', message);
      formData.append('client_name', client.name);
      if (client.company) {
        formData.append('company', client.company);
      }

      // Ajouter les pièces jointes
      attachments.forEach((file, index) => {
        formData.append('attachments', file);
      });

      const response = await fetch(`${API_URL}/api/clients/${client.id}/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
          // Ne pas définir Content-Type, le navigateur le fera automatiquement avec boundary
        },
        body: formData
      });

      if (!response.ok) {
        // Gestion des erreurs non-JSON (ex: erreur proxy, 502, etc.)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.message || 'Erreur lors de l\'envoi');
        } else {
          throw new Error(`Erreur serveur (${response.status})`);
        }
      }

      toast.success('Email envoyé avec succès !');
      onClose();
    } catch (error) {
      console.error('Erreur envoi email:', error);
      toast.error(error.message || 'Erreur lors de l\'envoi de l\'email');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <FiMail className="text-blue-400 text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Envoyer un email</h2>
                <p className="text-sm text-gray-400">
                  à {client?.name}{client?.company && ` (${client.company})`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <FiX className="text-gray-400 text-xl" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Destinataire */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Destinataire
              </label>
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700">
                {client?.type === 'company' ? (
                  <FiBriefcase className="text-indigo-400" />
                ) : (
                  <FiUser className="text-indigo-400" />
                )}
                <div>
                  <div className="text-white font-medium">{client?.name}</div>
                  <div className="text-sm text-gray-400">{client?.email}</div>
                </div>
              </div>
            </div>

            {/* Objet */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Objet <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet de votre email"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Écrivez votre message ici..."
                rows={12}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              />
              <div className="mt-2 text-xs text-gray-500">
                {message.length} caractères
              </div>
            </div>

            {/* Pièces jointes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Pièces jointes
              </label>

              {/* Bouton ajouter */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
              >
                <FiPaperclip />
                <span>Ajouter un fichier</span>
              </button>

              {/* Liste des fichiers */}
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FiFile className="text-blue-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-white text-sm truncate">{file.name}</div>
                          <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(index)}
                        className="p-2 hover:bg-red-600 rounded-lg transition-colors text-gray-400 hover:text-white"
                        title="Supprimer"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Indicateur taille totale */}
                  <div className="text-xs text-gray-500 flex items-center justify-between px-2">
                    <span>
                      {attachments.length} fichier{attachments.length > 1 ? 's' : ''}
                    </span>
                    <span>
                      Total : {formatFileSize(attachments.reduce((sum, file) => sum + file.size, 0))} / 25 MB
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-900/30">
            <button
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || !subject.trim() || !message.trim()}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Envoi en cours...</span>
                </>
              ) : (
                <>
                  <FiSend />
                  <span>Envoyer</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default EmailModal;
