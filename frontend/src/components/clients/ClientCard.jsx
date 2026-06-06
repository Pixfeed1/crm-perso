// src/components/clients/ClientCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiBriefcase, FiUser, FiMail, FiPhone, FiTool } from 'react-icons/fi';
import { formatDate, formatValue } from '../../utils/formatters';

const ClientCard = ({ client, isSelected, onClick, onMaintenanceClick }) => {
  // Configuration des couleurs de statut
  const statusConfig = {
    active: {
      bg: 'bg-green-500/20',
      text: 'text-green-300',
      border: 'border-green-500/30',
      label: 'Actif'
    },
    inactive: {
      bg: 'bg-gray-500/20',
      text: 'text-text-secondary',
      border: 'border-gray-500/30',
      label: 'Inactif'
    }
  };

  const statusStyle = statusConfig[client.status] || statusConfig.active;

  // Badge maintenance selon le statut prioritaire (past_due > canceling > active)
  const maintenanceBadge = {
    active: { bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'border-indigo-500/30' },
    canceling: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/30' },
    past_due: { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/30' }
  }[client.maintenance_status];

  // Configuration des types
  const typeConfig = {
    individual: { icon: FiUser, label: 'Particulier' },
    company: { icon: FiBriefcase, label: 'Entreprise' }
  };

  const typeInfo = typeConfig[client.type] || typeConfig.individual;
  const TypeIcon = typeInfo.icon;

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
        {/* En-tête avec type et statut */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <TypeIcon className="text-indigo-400 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {client.maintenance_count > 0 && maintenanceBadge && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (onMaintenanceClick) onMaintenanceClick(client, e); }}
                title="Voir le(s) contrat(s) de maintenance"
                className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1 transition hover:brightness-110 ${maintenanceBadge.bg} ${maintenanceBadge.text} ${maintenanceBadge.border}`}
              >
                <FiTool size={11} /> Maintenance{client.maintenance_count > 1 ? ` (${client.maintenance_count})` : ''}
              </button>
            )}
            <div className={`text-xs px-2.5 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border font-medium`}>
              {statusStyle.label}
            </div>
          </div>
        </div>

        {/* Nom et entreprise */}
        <div className="mb-4 flex-grow">
          <h3 className="font-bold text-text-primary text-base leading-tight mb-1 line-clamp-1">{client.name}</h3>
          {client.company && (
            <p className="text-sm text-indigo-300 font-medium line-clamp-1">{client.company}</p>
          )}
        </div>

        {/* Informations de contact */}
        <div className="space-y-2 mb-4">
          {client.email && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <FiMail className="text-gray-500 flex-shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <FiPhone className="text-gray-500 flex-shrink-0" />
              <span className="truncate">{client.phone}</span>
            </div>
          )}
        </div>

        {/* Valeur et date */}
        <div className="flex justify-between items-center pt-4 border-t border-border/50 mt-auto">
          {client.lifetime_value > 0 ? (
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Valeur</div>
              <div className="text-base font-bold text-green-400">
                {formatValue(client.lifetime_value)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Nouveau client</div>
          )}

          <div className="text-right">
            <div className="text-xs text-gray-500 mb-0.5">Client depuis</div>
            <div className="text-xs font-medium text-text-secondary">
              {client.contract_start_date ? formatDate(client.contract_start_date) : formatDate(client.created_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Indicateur visuel de sélection */}
      {isSelected && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"
          layoutId="selectedClientIndicator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.div>
  );
};

export default ClientCard;
