// src/components/leads/LeadCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { getStatusColors } from '../../constants/statusColors';

const LeadCard = ({ lead, isSelected, onClick }) => {
  // Récupération des couleurs depuis la configuration centralisée
  const statusStyle = getStatusColors(lead.status, 'lead');

  // Format de la date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', { 
      day: 'numeric',
      month: 'short'
    }).format(date);
  };
  
  return (
    <motion.div
      className={`rounded-xl p-4 cursor-pointer transition-colors relative overflow-hidden ${
        isSelected ? 'bg-indigo-900/40 border-indigo-500/50' : 'bg-gray-800/20 hover:bg-gray-800/40 border-transparent'
      } border`}
      whileHover={{ scale: 1.02 }}
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
        {/* En-tête avec type et date */}
        <div className="flex justify-between items-start mb-2">
          <div className={`text-xs px-2 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} font-medium`}>
            {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
          </div>
          <div className="text-xs text-gray-400">
            {formatDate(lead.created_at)}
          </div>
        </div>
        
        {/* Titre et entreprise */}
        <div className="mb-2">
          <h3 className="font-semibold text-white">{lead.name}</h3>
          {lead.type === 'company' && lead.company && (
            <p className="text-sm text-indigo-300">{lead.company}</p>
          )}
        </div>
        
        {/* Indicateur de source */}
        {lead.source && (
          <div className="flex items-center text-xs text-gray-400 mb-2">
            <span className="mr-1">📌</span>
            <span>{lead.source}</span>
          </div>
        )}
        
        {/* Contacts associés */}
        {lead.contacts && lead.contacts.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center space-x-1">
              {lead.contacts.slice(0, 3).map((contact, index) => (
                <div 
                  key={contact.id}
                  className="w-7 h-7 rounded-full bg-indigo-800 flex items-center justify-center text-xs font-medium text-white border border-indigo-600/50"
                  title={contact.name}
                >
                  {contact.name.charAt(0)}
                </div>
              ))}
              {lead.contacts.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium text-white">
                  +{lead.contacts.length - 3}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Indicateur visuel de sélection */}
      {isSelected && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"
          layoutId="selectedIndicator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.div>
  );
};

export default LeadCard;