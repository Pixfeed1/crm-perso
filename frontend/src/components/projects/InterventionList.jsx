// src/components/projects/InterventionList.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiTool, FiClock, FiCheckCircle, FiAlertCircle, FiRefreshCw, FiShield, FiDownload, FiHelpCircle, FiCalendar } from 'react-icons/fi';

const InterventionList = ({ interventions = [], stats, onToggleStatus, onEdit, onDelete }) => {
  // Configuration des types d'intervention
  const typeConfig = {
    'update': { icon: <FiRefreshCw />, label: 'Mise à jour', color: 'text-blue-400' },
    'backup': { icon: <FiDownload />, label: 'Sauvegarde', color: 'text-green-400' },
    'security': { icon: <FiShield />, label: 'Sécurité', color: 'text-red-400' },
    'maintenance': { icon: <FiTool />, label: 'Maintenance', color: 'text-purple-400' },
    'support': { icon: <FiHelpCircle />, label: 'Support', color: 'text-amber-400' },
    'other': { icon: <FiTool />, label: 'Autre', color: 'text-text-muted' }
  };

  // Configuration des statuts
  const statusConfig = {
    'planned': { label: 'Planifié', bg: 'bg-blue-500/20', text: 'text-blue-300' },
    'in_progress': { label: 'En cours', bg: 'bg-amber-500/20', text: 'text-amber-300' },
    'completed': { label: 'Terminé', bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
    'cancelled': { label: 'Annulé', bg: 'bg-gray-500/20', text: 'text-text-muted' }
  };

  // Configuration des priorités
  const priorityConfig = {
    'low': { label: 'Basse', color: 'text-text-muted' },
    'normal': { label: 'Normale', color: 'text-blue-400' },
    'high': { label: 'Haute', color: 'text-amber-400' },
    'urgent': { label: 'Urgente', color: 'text-red-400' }
  };

  // Formater la date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Formater la durée
  const formatDuration = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}`;
    }
    return `${mins}min`;
  };

  // Si aucune intervention
  if (interventions.length === 0) {
    return (
      <div className="bg-surface-muted/30 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3 text-text-muted"><FiTool /></div>
        <h4 className="text-lg font-medium text-text-secondary mb-2">Aucune intervention</h4>
        <p className="text-text-muted text-sm">
          Ajoutez des interventions pour suivre les actions réalisées sur ce projet.
        </p>
      </div>
    );
  }

  // Calcul du temps total
  const totalMinutes = stats?.total_duration || interventions.reduce((acc, i) => acc + (i.duration_minutes || 0), 0);

  return (
    <div>
      {/* Résumé des interventions */}
      <div className="mb-4 bg-surface-muted/30 p-4 rounded-lg flex flex-wrap gap-4 justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex items-center">
            <div className="text-2xl mr-3 text-purple-400"><FiTool /></div>
            <div>
              <h4 className="font-medium text-text-primary">{interventions.length} intervention{interventions.length > 1 ? 's' : ''}</h4>
              <div className="text-sm text-text-muted">
                {stats?.completed || interventions.filter(i => i.status === 'completed').length} terminée{(stats?.completed || interventions.filter(i => i.status === 'completed').length) > 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <div className="text-2xl mr-3 text-indigo-400"><FiClock /></div>
            <div>
              <h4 className="font-medium text-text-primary">{formatDuration(totalMinutes)}</h4>
              <div className="text-sm text-text-muted">Temps total</div>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des interventions */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {interventions.map(intervention => {
            const typeInfo = typeConfig[intervention.type] || typeConfig.other;
            const statusInfo = statusConfig[intervention.status] || statusConfig.planned;
            const priorityInfo = priorityConfig[intervention.priority] || priorityConfig.normal;

            return (
              <motion.div
                key={intervention.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className={`p-4 rounded-lg ${
                  intervention.status === 'completed' ? 'bg-purple-900/20' : 'bg-surface/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start flex-1">
                    {/* Icône du type */}
                    <div className={`text-xl mr-3 mt-1 ${typeInfo.color}`}>
                      {typeInfo.icon}
                    </div>

                    <div className="flex-1">
                      {/* Titre et type */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium ${intervention.status === 'completed' ? 'text-text-muted' : 'text-text-primary'}`}>
                          {intervention.title}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.bg} ${statusInfo.text}`}>
                          {statusInfo.label}
                        </span>
                      </div>

                      {/* Description */}
                      {intervention.description && (
                        <p className="text-sm text-text-muted mb-2">{intervention.description}</p>
                      )}

                      {/* Métadonnées */}
                      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
                        {intervention.scheduled_date && (
                          <span className="flex items-center gap-1">
                            <FiCalendar className="text-gray-600" />
                            {formatDate(intervention.scheduled_date)}
                          </span>
                        )}
                        {intervention.duration_minutes && (
                          <span className="flex items-center gap-1">
                            <FiClock className="text-gray-600" />
                            {formatDuration(intervention.duration_minutes)}
                          </span>
                        )}
                        {intervention.technician && (
                          <span className="text-text-muted">Par: {intervention.technician}</span>
                        )}
                        {intervention.priority !== 'normal' && (
                          <span className={priorityInfo.color}>
                            Priorité {priorityInfo.label.toLowerCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {intervention.status !== 'completed' && intervention.status !== 'cancelled' && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="p-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300"
                        onClick={() => onToggleStatus && onToggleStatus(intervention.id, 'completed')}
                        title="Marquer comme terminé"
                      >
                        <FiCheckCircle size={16} />
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default InterventionList;
