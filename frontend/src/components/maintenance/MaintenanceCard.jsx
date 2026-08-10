// src/components/maintenance/MaintenanceCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiGlobe, FiCalendar, FiZap, FiAlertCircle } from 'react-icons/fi';
import { formatDate } from '../../utils/formatters';

const MaintenanceCard = ({ contract, isSelected, onClick }) => {
  // Configuration des couleurs de statut
  const statusConfig = {
    active: {
      bg: 'bg-green-500/20',
      text: 'text-green-300',
      border: 'border-green-500/30',
      label: 'Actif'
    },
    paused: {
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      label: 'En pause'
    },
    cancelled: {
      bg: 'bg-gray-500/20',
      text: 'text-text-secondary',
      border: 'border-gray-500/30',
      label: 'Annulé'
    }
  };

  const statusStyle = statusConfig[contract.status] || statusConfig.active;

  // Vérifier si un rapport est dû. En mode ponctuel ('aucun'), il n'y a pas
  // d'échéance à tenir : le rapport se fait à la demande, donc jamais « dû ».
  const isReportDue = contract.report_frequency !== 'aucun'
    && contract.next_report_due && new Date(contract.next_report_due) <= new Date();

  // Couleur du PageSpeed
  const getPageSpeedColor = (score) => {
    if (!score) return 'text-text-muted';
    if (score >= 90) return 'text-green-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <motion.div
      className={`rounded-xl p-5 cursor-pointer transition-all relative overflow-hidden h-full flex flex-col ${
        isSelected
          ? 'bg-indigo-900/40 border-indigo-500/50 shadow-lg shadow-indigo-500/20 z-10'
          : 'bg-surface/40 hover:bg-surface/60 border-border/50 hover:border-border-strong/50 hover:shadow-xl hover:shadow-black/20 hover:z-20'
      } border backdrop-blur-sm`}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      layout
    >
      {/* Effet de brillance au survol */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {/* En-tête avec icône et statut */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <FiGlobe className="text-indigo-400 text-sm" />
            </div>
            {isReportDue && (
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <FiAlertCircle size={12} />
                <span>Rapport dû</span>
              </div>
            )}
          </div>
          <div className={`text-xs px-2.5 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border font-medium`}>
            {statusStyle.label}
          </div>
        </div>

        {/* Nom du site et client */}
        <div className="mb-4 flex-grow">
          <h3 className="font-bold text-text-primary text-base leading-tight mb-1 line-clamp-1">
            {contract.site_name}
          </h3>
          {contract.client_name && (
            <p className="text-sm text-indigo-300 font-medium line-clamp-1">
              {contract.client_name}
            </p>
          )}
          {contract.site_url && (
            <p className="text-xs text-text-muted truncate mt-1">
              {contract.site_url.replace(/^https?:\/\//, '')}
            </p>
          )}
        </div>

        {/* Scores PageSpeed */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <FiZap className="text-text-muted" size={14} />
            <span className={`text-sm font-medium ${getPageSpeedColor(contract.pagespeed_mobile)}`}>
              {contract.pagespeed_mobile || '-'}
            </span>
            <span className="text-gray-600 text-xs">/</span>
            <span className={`text-sm font-medium ${getPageSpeedColor(contract.pagespeed_desktop)}`}>
              {contract.pagespeed_desktop || '-'}
            </span>
          </div>
          {contract.wordpress_version && (
            <span className="text-xs text-text-muted bg-surface-strong/50 px-2 py-0.5 rounded">
              v{contract.wordpress_version}
            </span>
          )}
        </div>

        {/* Infos de date */}
        <div className="flex justify-between items-center pt-4 border-t border-border/50 mt-auto">
          <div>
            <div className="text-xs text-text-muted mb-0.5">Dernier rapport</div>
            <div className="text-xs font-medium text-text-secondary">
              {contract.last_report_date ? formatDate(contract.last_report_date) : 'Jamais'}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-text-muted mb-0.5">Prochain</div>
            <div className={`text-xs font-medium ${isReportDue ? 'text-amber-400' : 'text-text-secondary'}`}>
              {contract.next_report_due ? formatDate(contract.next_report_due) : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* Indicateur visuel de sélection */}
      {isSelected && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"
          layoutId="selectedContractIndicator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.div>
  );
};

export default MaintenanceCard;
