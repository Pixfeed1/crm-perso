// src/components/calendar/EventDetails.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClock, FiCheck, FiEdit2, FiTrash2, FiCalendar, FiFileText, FiUser, FiZap } from 'react-icons/fi';
import { categoryMeta, priorityMeta } from '../../utils/eventStyles';

const EventDetails = ({ event, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Styles centralisés (tokens) pour la catégorie et la priorité
  const catMeta = categoryMeta(event.category);
  const priMeta = priorityMeta(event.priority);
  const CatIcon = catMeta.Icon;

  // Vérifier la validité d'une date
  const isValidDate = (date) => date instanceof Date && !isNaN(date.getTime());

  // Formater les dates avec vérification de validité
  const formatDate = (dateString) => {
    try {
      if (!dateString) return 'Date non définie';
      const date = new Date(dateString);
      if (!isValidDate(date)) {
        console.error('Date invalide:', dateString);
        return 'Date invalide';
      }
      return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(date);
    } catch (error) {
      console.error('Erreur lors du formatage de la date:', error, dateString);
      return 'Erreur de date';
    }
  };

  // Formater la durée avec vérification de validité des dates
  const formatDuration = () => {
    try {
      if (!event.start_datetime || !event.end_datetime) return 'Durée inconnue';
      const start = new Date(event.start_datetime);
      const end = new Date(event.end_datetime);
      if (!isValidDate(start) || !isValidDate(end)) {
        console.error('Dates invalides pour le calcul de durée:', start, end);
        return 'Durée inconnue';
      }
      if (event.all_day) {
        const diffTime = end - start;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) return 'Toute la journée';
        return `${diffDays} jours`;
      }
      const diffTime = end - start;
      const hours = Math.floor(diffTime / (1000 * 60 * 60));
      const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
      let result = '';
      if (hours > 0) result += `${hours} heure${hours > 1 ? 's' : ''}`;
      if (minutes > 0) {
        if (result) result += ' ';
        result += `${minutes} minute${minutes > 1 ? 's' : ''}`;
      }
      return result || 'Moins d\'une minute';
    } catch (error) {
      console.error('Erreur lors du calcul de la durée:', error);
      return 'Erreur de calcul de durée';
    }
  };

  // Vérifier si l'événement est passé
  const isPast = () => {
    try {
      if (!event.end_datetime) return false;
      const end = new Date(event.end_datetime);
      if (!isValidDate(end)) return false;
      return end < new Date();
    } catch (error) {
      console.error('Erreur lors de la vérification si l\'événement est passé:', error);
      return false;
    }
  };

  // Vérifier si l'événement est en cours
  const isOngoing = () => {
    try {
      if (!event.start_datetime || !event.end_datetime) return false;
      const start = new Date(event.start_datetime);
      const end = new Date(event.end_datetime);
      if (!isValidDate(start) || !isValidDate(end)) return false;
      const now = new Date();
      return start <= now && end >= now;
    } catch (error) {
      console.error('Erreur lors de la vérification si l\'événement est en cours:', error);
      return false;
    }
  };

  // Confirmation et suppression de l'événement
  const handleConfirmDelete = async () => {
    try {
      await onDelete();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'événement:', error);
    }
  };

  return (
    <div>
      {/* En-tête avec actions */}
      <div className="flex justify-between items-start mb-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-text-primary break-words">
            {event.title || 'Sans titre'}
          </h2>
          <div className={`inline-flex items-center gap-1 px-3 py-1 mt-2 rounded-full ${catMeta.badge} text-sm`}>
            <CatIcon />
            <span>{catMeta.label}</span>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent"
            onClick={() => setIsEditing(!isEditing)}
          >
            <FiEdit2 />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-danger-bg hover:opacity-80 text-danger-text"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <FiTrash2 />
          </motion.button>
        </div>
      </div>

      {/* Statut de l'événement */}
      <div className="mb-6">
        {isPast() ? (
          <div className="bg-neutral-bg text-neutral-text px-4 py-2 rounded-lg flex items-center gap-2">
            <FiCheck />
            Événement passé
          </div>
        ) : isOngoing() ? (
          <div className="bg-success-bg text-success-text px-4 py-2 rounded-lg flex items-center gap-2">
            <FiClock />
            En cours
          </div>
        ) : (
          <div className="bg-info-bg text-info-text px-4 py-2 rounded-lg flex items-center gap-2">
            <FiClock />
            À venir
          </div>
        )}
      </div>

      {/* Informations principales */}
      <div className="grid grid-cols-1 gap-6">
        {/* Panneau Date et heure */}
        <div className="bg-surface-muted/50 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <FiCalendar />
            Date et heure
          </h3>

          <div className="space-y-4">
            {event.all_day ? (
              <>
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted">Date</span>
                  <span className="font-medium text-text-primary text-right">
                    {event.start_datetime ?
                      new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(event.start_datetime)) :
                      'Date non définie'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted">Durée</span>
                  <span className="font-medium text-text-primary">{formatDuration()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-text-muted">Début</span>
                  <span className="font-medium text-text-primary sm:text-right">
                    {event.start_datetime ? formatDate(event.start_datetime) : 'Non défini'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-text-muted">Fin</span>
                  <span className="font-medium text-text-primary sm:text-right">
                    {event.end_datetime ? formatDate(event.end_datetime) : 'Non défini'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted">Durée</span>
                  <span className="font-medium text-text-primary">{formatDuration()}</span>
                </div>
              </>
            )}

            {event.reminder_time && (
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Rappel</span>
                <span className="font-medium text-text-primary text-right">{formatDate(event.reminder_time)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Panneau Détails */}
        <div className="bg-surface-muted/50 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <FiFileText />
            Détails
          </h3>

          <div className="space-y-4">
            {/* Priorité */}
            <div className="flex justify-between items-center gap-3">
              <span className="text-text-muted">Priorité</span>
              <span className={`px-3 py-1 rounded-full ${priMeta.badge} text-sm font-medium`}>
                {priMeta.label}
              </span>
            </div>

            {/* Lieu */}
            {event.location && (
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Lieu</span>
                <span className="font-medium text-text-primary text-right break-words">{event.location}</span>
              </div>
            )}

            {/* Élément relié */}
            {event.related_to && event.related_to.name && (
              <div className="flex justify-between items-center gap-3">
                <span className="text-text-muted">Associé à</span>
                <span className="px-3 py-1 rounded-full bg-surface-strong text-text-secondary text-sm flex items-center gap-1">
                  {event.related_to.type === 'lead' ? <FiUser /> : <FiZap />}
                  {event.related_to.name}
                </span>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-text-muted mb-2">Description</h4>
                <div className="bg-surface-muted rounded-lg p-4 text-text-secondary whitespace-pre-wrap break-words">
                  {event.description}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Popup de confirmation de suppression */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-surface border border-border rounded-xl p-6 max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-xl font-semibold text-text-primary mb-2">Confirmer la suppression</h3>
              <p className="text-text-secondary mb-6">
                Êtes-vous sûr de vouloir supprimer définitivement cet événement ? Cette action ne peut pas être annulée.
              </p>

              <div className="flex justify-end gap-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border-2 border-border text-text-primary hover:bg-surface-strong font-medium transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </motion.button>

                <motion.button
                  className="px-4 py-2 rounded-lg bg-danger-text text-white hover:opacity-90 font-medium"
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
    </div>
  );
};

export default EventDetails;
