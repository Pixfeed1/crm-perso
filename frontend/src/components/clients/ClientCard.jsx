// src/components/clients/ClientCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiBriefcase, FiUser, FiMail, FiPhone } from 'react-icons/fi';
import { formatDate, formatValue } from '../../utils/formatters';

const ClientCard = ({ client, isSelected, onClick }) => {
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
      text: 'text-gray-300',
      border: 'border-gray-500/30',
      label: 'Inactif'
    }
  };

  const statusStyle = statusConfig[client.status] || statusConfig.active;

  // Configuration des types
  const typeConfig = {
    individual: { icon: FiUser, label: 'Particulier' },
    company: { icon: FiBriefcase, label: 'Entreprise' }
  };

  const typeInfo = typeConfig[client.type] || typeConfig.individual;
  const TypeIcon = typeInfo.icon;

  return (
    <motion.div
      className={`rounded-xl p-4 cursor-pointer transition-colors relative overflow-hidden ${
        isSelected ? 'bg-indigo-900/40 border-indigo-500/50 z-10' : 'bg-gray-800/20 hover:bg-gray-800/40 border-transparent hover:z-20'
      } border`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      layout
    >
      {/* Effet de brillance au survol */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        initial={{ x: '-100%' }}
        whileHover={{ x: '100%' }}
        transition={{ duration: 0.6 }}
      />

      <div className="relative z-10">
        {/* En-tête avec type et statut */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <TypeIcon className="text-indigo-400 text-sm" />
            <span className="text-xs text-gray-400">{typeInfo.label}</span>
          </div>
          <div className={`text-xs px-2 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} font-medium`}>
            {statusStyle.label}
          </div>
        </div>

        {/* Nom et entreprise */}
        <div className="mb-3">
          <h3 className="font-semibold text-white text-lg">{client.name}</h3>
          {client.company && (
            <p className="text-sm text-indigo-300 mt-1">{client.company}</p>
          )}
        </div>

        {/* Informations de contact */}
        <div className="space-y-2 mb-3">
          {client.email && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <FiMail className="text-gray-500" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <FiPhone className="text-gray-500" />
              <span>{client.phone}</span>
            </div>
          )}
        </div>

        {/* Valeur et date */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-700/50">
          {client.lifetime_value > 0 ? (
            <div>
              <div className="text-xs text-gray-500">Valeur</div>
              <div className="text-sm font-semibold text-green-400">
                {formatValue(client.lifetime_value)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Pas de valeur</div>
          )}

          <div className="text-right">
            <div className="text-xs text-gray-500">Depuis</div>
            <div className="text-xs text-gray-400">
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
