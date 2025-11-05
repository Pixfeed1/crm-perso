// src/components/reminders/RemindersList.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiXCircle, FiTrash2, FiAlertCircle, FiClock, FiUser, FiBriefcase, FiTarget, FiActivity } from 'react-icons/fi';

const RemindersList = ({ reminders, onComplete, onDismiss, onDelete }) => {
  // Configuration des icônes par type d'entité
  const entityIcons = {
    lead: <FiUser className="text-purple-400" />,
    project: <FiBriefcase className="text-blue-400" />,
    goal: <FiTarget className="text-amber-400" />,
    activity: <FiActivity className="text-green-400" />
  };

  // Configuration des couleurs par priorité
  const priorityConfig = {
    low: { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-300' },
    medium: { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-300' },
    high: { bg: 'bg-rose-500/20', border: 'border-rose-500/30', text: 'text-rose-300' }
  };

  // Format de la date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (date - now) / (1000 * 60 * 60);
    const diffInDays = Math.floor(diffInHours / 24);

    // Si c'est passé
    if (diffInHours < 0) {
      const absDays = Math.abs(diffInDays);
      if (absDays === 0) {
        return "Aujourd'hui";
      } else if (absDays === 1) {
        return "Hier";
      } else {
        return `Il y a ${absDays} jour${absDays > 1 ? 's' : ''}`;
      }
    }

    // Si c'est à venir
    if (diffInDays === 0) {
      if (diffInHours < 1) {
        return `Dans ${Math.floor(diffInHours * 60)} min`;
      }
      return `Dans ${Math.floor(diffInHours)}h`;
    } else if (diffInDays === 1) {
      return "Demain";
    } else if (diffInDays < 7) {
      return `Dans ${diffInDays} jours`;
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  };

  // Déterminer si un rappel est en retard
  const isOverdue = (dateString) => {
    return new Date(dateString) < new Date();
  };

  return (
    <div className="space-y-3">
      {reminders.map((reminder, index) => {
        const overdue = isOverdue(reminder.due_date);
        const priority = priorityConfig[reminder.priority] || priorityConfig.medium;

        return (
          <motion.div
            key={reminder.id}
            className={`bg-gray-800/50 rounded-lg p-4 border ${priority.border} ${priority.bg}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              {/* Icône d'entité */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center text-lg">
                  {entityIcons[reminder.entity_type] || <FiClock />}
                </div>
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <h3 className="font-medium text-white text-sm sm:text-base break-words">
                      {reminder.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <span className="capitalize">{reminder.entity_type}</span>
                      <span>•</span>
                      <span className={overdue ? 'text-rose-400 flex items-center gap-1' : 'flex items-center gap-1'}>
                        {overdue && <FiAlertCircle className="text-xs" />}
                        {formatDate(reminder.due_date)}
                      </span>
                      <span>•</span>
                      <span className={priority.text}>{reminder.priority === 'high' ? 'Haute' : reminder.priority === 'medium' ? 'Moyenne' : 'Basse'}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {reminder.description && (
                  <p className="text-sm text-gray-300 mb-3 break-words">
                    {reminder.description}
                  </p>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    className="px-3 py-1.5 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded-lg text-xs sm:text-sm flex items-center gap-1"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onComplete(reminder.id)}
                  >
                    <FiCheck className="text-xs" />
                    Fait
                  </motion.button>

                  <motion.button
                    className="px-3 py-1.5 bg-gray-700/30 hover:bg-gray-700/50 text-gray-300 rounded-lg text-xs sm:text-sm flex items-center gap-1"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onDismiss(reminder.id)}
                  >
                    <FiXCircle className="text-xs" />
                    Ignorer
                  </motion.button>

                  <motion.button
                    className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 rounded-lg text-xs sm:text-sm flex items-center gap-1"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onDelete(reminder.id)}
                  >
                    <FiTrash2 className="text-xs" />
                    Supprimer
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default RemindersList;
