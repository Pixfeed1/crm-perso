// src/components/calendar/EventDetails.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUsers, FiPhone, FiClock, FiCheck, FiHome, FiClipboard, FiEdit2, FiTrash2, FiCalendar, FiFileText, FiUser, FiZap } from 'react-icons/fi';

const EventDetails = ({ event, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Configuration des couleurs de catégorie
  const categoryConfig = {
    'meeting': {
      bg: 'bg-blue-500/30',
      text: 'text-blue-300',
      border: 'border-blue-500/50',
      label: 'Réunion',
      icon: <FiUsers />
    },
    'call': {
      bg: 'bg-green-500/30',
      text: 'text-green-300',
      border: 'border-green-500/50',
      label: 'Appel',
      icon: <FiPhone />
    },
    'deadline': {
      bg: 'bg-amber-500/30',
      text: 'text-amber-300',
      border: 'border-amber-500/50',
      label: 'Échéance',
      icon: <FiClock />
    },
    'task': {
      bg: 'bg-purple-500/30',
      text: 'text-purple-300',
      border: 'border-purple-500/50',
      label: 'Tâche',
      icon: <FiCheck />
    },
    'personal': {
      bg: 'bg-rose-500/30',
      text: 'text-rose-300',
      border: 'border-rose-500/50',
      label: 'Personnel',
      icon: <FiHome />
    }
  };

  // Configuration des couleurs de priorité
  const priorityConfig = {
    'low': {
      bg: 'bg-gray-500/20',
      text: 'text-gray-300',
      label: 'Basse'
    },
    'medium': {
      bg: 'bg-indigo-500/20',
      text: 'text-indigo-300',
      label: 'Moyenne'
    },
    'high': {
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      label: 'Haute'
    },
    'critical': {
      bg: 'bg-rose-500/20',
      text: 'text-rose-300',
      label: 'Critique'
    }
  };

  // Valeurs par défaut si la catégorie ou priorité n'est pas configurée
  const categoryStyle = categoryConfig[event.category] || {
    bg: 'bg-gray-500/30',
    text: 'text-gray-300',
    border: 'border-gray-500/50',
    label: event.category || 'Autre',
    icon: <FiClipboard />
  };
  
  const priorityStyle = priorityConfig[event.priority] || {
    bg: 'bg-gray-500/20',
    text: 'text-gray-300',
    label: event.priority || 'Non définie'
  };
  
  // Vérifier la validité d'une date
  const isValidDate = (date) => {
    return date instanceof Date && !isNaN(date.getTime());
  };
  
  // Formater les dates avec vérification de validité
  const formatDate = (dateString) => {
    try {
      if (!dateString) return 'Date non définie';
      
      const date = new Date(dateString);
      
      // Vérifier si la date est valide
      if (!isValidDate(date)) {
        console.error('Date invalide:', dateString);
        return 'Date invalide';
      }
      
      return new Intl.DateTimeFormat('fr-FR', { 
        dateStyle: 'full',
        timeStyle: 'short'
      }).format(date);
    } catch (error) {
      console.error('Erreur lors du formatage de la date:', error, dateString);
      return 'Erreur de date';
    }
  };
  
  // Formater la durée avec vérification de validité des dates
  const formatDuration = () => {
    try {
      if (!event.start_datetime || !event.end_datetime) {
        return 'Durée inconnue';
      }
      
      const start = new Date(event.start_datetime);
      const end = new Date(event.end_datetime);
      
      // Vérifier si les dates sont valides
      if (!isValidDate(start) || !isValidDate(end)) {
        console.error('Dates invalides pour le calcul de durée:', start, end);
        return 'Durée inconnue';
      }
      
      if (event.all_day) {
        // Calculer le nombre de jours
        const diffTime = end - start;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          return 'Toute la journée';
        }
        return `${diffDays} jours`;
      }
      
      // Calculer les heures et minutes
      const diffTime = end - start;
      const hours = Math.floor(diffTime / (1000 * 60 * 60));
      const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
      
      let result = '';
      if (hours > 0) {
        result += `${hours} heure${hours > 1 ? 's' : ''}`;
      }
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
      
      // Vérifier si la date est valide
      if (!isValidDate(end)) {
        return false;
      }
      
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
      
      // Vérifier si les dates sont valides
      if (!isValidDate(start) || !isValidDate(end)) {
        return false;
      }
      
      const now = new Date();
      return start <= now && end >= now;
    } catch (error) {
      console.error('Erreur lors de la vérification si l\'événement est en cours:', error);
      return false;
    }
  };
  
  // Mettre à jour le statut d'un événement
  const handleUpdateStatus = async (status) => {
    try {
      await onUpdate({ status });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
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
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-indigo-300">
            {event.title || 'Sans titre'}
          </h2>
          <div className={`inline-flex items-center px-3 py-1 mt-2 rounded-full ${categoryStyle.bg} ${categoryStyle.text} text-sm`}>
            <span className="mr-1">{categoryStyle.icon}</span>
            <span>{categoryStyle.label}</span>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300"
            onClick={() => setIsEditing(true)}
          >
            <FiEdit2 />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <FiTrash2 />
          </motion.button>
        </div>
      </div>
      
      {/* Statut de l'événement */}
      <div className="mb-6">
        {isPast() ? (
          <div className="bg-gray-800/30 text-gray-300 px-4 py-2 rounded-lg flex items-center gap-2">
            <FiCheck />
            Événement passé
          </div>
        ) : isOngoing() ? (
          <div className="bg-green-900/30 text-green-300 px-4 py-2 rounded-lg flex items-center gap-2">
            <FiClock />
            En cours
          </div>
        ) : (
          <div className="bg-indigo-900/30 text-indigo-300 px-4 py-2 rounded-lg flex items-center gap-2">
            <FiClock />
            À venir
          </div>
        )}
      </div>
      
      {/* Informations principales */}
      <div className="grid grid-cols-1 gap-6">
        {/* Panneau Date et heure */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center gap-2">
            <FiCalendar />
            Date et heure
          </h3>
          
          <div className="space-y-4">
            {event.all_day ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-400">Date</span>
                  <span className="font-medium text-white">
                    {event.start_datetime ? 
                      new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(event.start_datetime)) :
                      'Date non définie'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Durée</span>
                  <span className="font-medium text-white">{formatDuration()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-gray-400">Début</span>
                  <span className="font-medium text-white">
                    {event.start_datetime ? formatDate(event.start_datetime) : 'Non défini'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-gray-400">Fin</span>
                  <span className="font-medium text-white">
                    {event.end_datetime ? formatDate(event.end_datetime) : 'Non défini'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Durée</span>
                  <span className="font-medium text-white">{formatDuration()}</span>
                </div>
              </>
            )}
            
            {event.reminder_time && (
              <div className="flex justify-between">
                <span className="text-gray-400">Rappel</span>
                <span className="font-medium text-white">{formatDate(event.reminder_time)}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Panneau Détails */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center gap-2">
            <FiFileText />
            Détails
          </h3>
          
          <div className="space-y-4">
            {/* Priorité */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Priorité</span>
              <span className={`px-3 py-1 rounded-full ${priorityStyle.bg} ${priorityStyle.text} text-sm font-medium`}>
                {priorityStyle.label}
              </span>
            </div>
            
            {/* Lieu */}
            {event.location && (
              <div className="flex justify-between">
                <span className="text-gray-400">Lieu</span>
                <span className="font-medium text-white">{event.location}</span>
              </div>
            )}
            
            {/* Élément relié */}
            {event.related_to && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Associé à</span>
                <span className="px-3 py-1 rounded-full bg-gray-700/50 text-gray-300 text-sm flex items-center gap-1">
                  {event.related_to.type === 'lead' ? <FiUser /> : <FiZap />}
                  {event.related_to.name}
                </span>
              </div>
            )}
            
            {/* Description */}
            {event.description && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Description</h4>
                <div className="bg-gray-900/50 rounded-lg p-4 text-gray-300">
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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full m-4"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-xl font-semibold text-white mb-2">Confirmer la suppression</h3>
              <p className="text-gray-300 mb-6">
                Êtes-vous sûr de vouloir supprimer définitivement cet événement ? Cette action ne peut pas être annulée.
              </p>
              
              <div className="flex justify-end space-x-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </motion.button>
                
                <motion.button
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium"
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