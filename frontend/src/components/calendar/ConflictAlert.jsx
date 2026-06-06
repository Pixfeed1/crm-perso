// src/components/calendar/ConflictAlert.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle, FiClock, FiMapPin, FiX } from 'react-icons/fi';

const ConflictAlert = ({ conflicts, onClose, onViewAlternatives }) => {
  if (!conflicts || conflicts.length === 0) return null;

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-500/10 border-red-500/50 text-red-400';
      case 'medium':
        return 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400';
      case 'low':
        return 'bg-blue-500/10 border-blue-500/50 text-blue-400';
      default:
        return 'bg-gray-500/10 border-gray-500/50 text-text-muted';
    }
  };

  const getSeverityIcon = (severity) => {
    const className = severity === 'high' ? 'text-red-500' : severity === 'medium' ? 'text-yellow-500' : 'text-blue-500';
    return <FiAlertTriangle className={`text-2xl ${className}`} />;
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins}` : `${hours}h`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-4 bg-gradient-to-r from-red-900/20 to-orange-900/20 border-2 border-red-500/50 rounded-lg p-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <FiAlertTriangle className="text-red-500 text-2xl flex-shrink-0" />
            <div>
              <h3 className="text-lg font-bold text-red-400">
                {conflicts.length} Conflit{conflicts.length > 1 ? 's' : ''} détecté{conflicts.length > 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-text-secondary">
                Cet événement chevauche d'autres événements existants
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <FiX className="text-xl" />
            </button>
          )}
        </div>

        {/* Liste des conflits */}
        <div className="space-y-2 mb-4">
          {conflicts.map((conflict, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-3 rounded-lg border ${getSeverityColor(conflict.severity)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getSeverityIcon(conflict.severity)}
                    <h4 className="font-semibold text-text-primary">{conflict.eventTitle}</h4>
                  </div>

                  <div className="space-y-1 text-sm">
                    {conflict.eventStart && conflict.eventEnd && (
                      <div className="flex items-center gap-2 text-text-secondary">
                        <FiClock className="flex-shrink-0" />
                        <span>
                          {formatDateTime(conflict.eventStart)} - {formatDateTime(conflict.eventEnd).split(' ').pop()}
                        </span>
                      </div>
                    )}

                    {conflict.eventLocation && (
                      <div className="flex items-center gap-2 text-text-secondary">
                        <FiMapPin className="flex-shrink-0" />
                        <span>{conflict.eventLocation}</span>
                      </div>
                    )}

                    {conflict.overlapDuration && (
                      <div className="mt-2 pt-2 border-t border-border-strong">
                        <span className="text-xs text-text-muted">
                          Chevauchement :{' '}
                          <span className="font-semibold text-text-primary">
                            {formatDuration(conflict.overlapDuration)}
                          </span>
                        {conflict.conflictType === 'location' && (
                          <span className="ml-2 px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                            Même lieu
                          </span>
                        )}
                      </span>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <motion.button
            onClick={onViewAlternatives}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex-1 px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <FiClock />
            <span>Voir les créneaux disponibles</span>
          </motion.button>

          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-4 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg font-semibold transition-colors"
          >
            Continuer quand même
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConflictAlert;
