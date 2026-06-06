// src/components/leads/InteractionTimeline.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPhone, FiMail, FiUsers, FiFileText, FiEdit2, FiTrash2, FiClock, FiUser } from 'react-icons/fi';
import InteractionForm from './InteractionForm';

const InteractionTimeline = ({ interactions = [], contacts = [], onUpdateInteraction, onDeleteInteraction }) => {
  const [editingInteraction, setEditingInteraction] = useState(null);
  const [deletingInteraction, setDeletingInteraction] = useState(null);

  // Configuration des types d'interaction
  const interactionConfig = {
    call: {
      icon: <FiPhone />,
      label: 'Appel',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      border: 'border-blue-500/30'
    },
    email: {
      icon: <FiMail />,
      label: 'Email',
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      border: 'border-purple-500/30'
    },
    meeting: {
      icon: <FiUsers />,
      label: 'Réunion',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/30'
    },
    note: {
      icon: <FiFileText />,
      label: 'Note',
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/30'
    }
  };

  // Format de la date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Gérer la sauvegarde d'une interaction éditée
  const handleSaveEdit = async (interactionData) => {
    if (onUpdateInteraction) {
      await onUpdateInteraction(editingInteraction.id, interactionData);
    }
    setEditingInteraction(null);
  };

  // Confirmer la suppression
  const handleConfirmDelete = async () => {
    if (onDeleteInteraction && deletingInteraction) {
      await onDeleteInteraction(deletingInteraction.id);
    }
    setDeletingInteraction(null);
  };

  // Si aucune interaction n'est disponible
  if (interactions.length === 0) {
    return (
      <div className="bg-surface-muted/30 rounded-lg p-4 sm:p-6 text-center">
        <div className="text-3xl sm:text-4xl mb-3 text-gray-500">
          <FiClock />
        </div>
        <h4 className="text-base sm:text-lg font-medium text-text-secondary mb-2">Aucune interaction</h4>
        <p className="text-text-muted text-xs sm:text-sm">
          Commencez à suivre vos échanges avec ce lead en ajoutant une interaction.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        {interactions.map((interaction, index) => {
          const config = interactionConfig[interaction.type] || interactionConfig.note;

          return (
            <motion.div
              key={interaction.id}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {/* Ligne de connexion pour la timeline */}
              {index < interactions.length - 1 && (
                <div className="absolute left-4 sm:left-5 top-12 sm:top-14 bottom-0 w-0.5 bg-gradient-to-b from-surface-strong to-transparent -mb-3 sm:-mb-4" />
              )}

              <div className="flex gap-3 sm:gap-4">
                {/* Icône du type d'interaction */}
                <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full ${config.bg} border ${config.border} flex items-center justify-center ${config.color} relative z-10`}>
                  <span className="text-sm sm:text-base text-text-primary">{config.icon}</span>
                </div>

                {/* Contenu de l'interaction */}
                <div className="flex-1 bg-surface-muted/30 rounded-lg p-3 sm:p-4 min-w-0">
                  {/* En-tête */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2 sm:mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs sm:text-sm font-medium ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <FiClock className="text-xs" />
                          {formatDate(interaction.date)}
                        </span>
                      </div>
                      <h4 className="font-medium text-text-primary text-sm sm:text-base break-words">
                        {interaction.description}
                      </h4>
                      {interaction.contact_name && (
                        <p className="text-xs text-indigo-300 mt-1 flex items-center gap-1">
                          <FiUser className="text-xs" />
                          {interaction.contact_name}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <motion.button
                        className="text-xs sm:text-sm text-indigo-300 hover:text-indigo-200 p-1.5 sm:p-2 rounded-lg hover:bg-indigo-900/30"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setEditingInteraction(interaction)}
                      >
                        <FiEdit2 className="text-xs sm:text-sm text-indigo-300" />
                      </motion.button>
                      <motion.button
                        className="text-xs sm:text-sm text-rose-300 hover:text-rose-200 p-1.5 sm:p-2 rounded-lg hover:bg-rose-900/30"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setDeletingInteraction(interaction)}
                      >
                        <FiTrash2 className="text-xs sm:text-sm text-rose-300" />
                      </motion.button>
                    </div>
                  </div>

                  {/* Notes détaillées */}
                  {interaction.notes && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-xs sm:text-sm text-text-secondary whitespace-pre-wrap break-words">
                        {interaction.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Modal d'édition */}
      <AnimatePresence>
        {editingInteraction && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingInteraction(null)}
          >
            <motion.div
              className="bg-surface-muted border border-border rounded-xl p-4 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg sm:text-xl font-semibold text-text-primary mb-4">Éditer l'interaction</h3>
              <InteractionForm
                interaction={editingInteraction}
                contacts={contacts}
                onSave={handleSaveEdit}
                onCancel={() => setEditingInteraction(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmation de suppression */}
      <AnimatePresence>
        {deletingInteraction && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-surface-muted border border-border rounded-xl p-4 sm:p-6 max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-lg sm:text-xl font-semibold text-text-primary mb-2">Confirmer la suppression</h3>
              <p className="text-text-secondary text-sm sm:text-base mb-4 sm:mb-6">
                Êtes-vous sûr de vouloir supprimer cette interaction ? Cette action ne peut pas être annulée.
              </p>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium transition-all text-sm sm:text-base"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDeletingInteraction(null)}
                >
                  Annuler
                </motion.button>

                <motion.button
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm sm:text-base"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirmDelete}
                >
                  Supprimer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default InteractionTimeline;
