// src/components/leads/LeadFilter.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LeadFilter = ({ filters, setFilters }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Options de statut
  const statusOptions = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'nouveau', label: 'Nouveau' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'qualifié', label: 'Qualifié' },
    { value: 'négociation', label: 'Négociation' },
    { value: 'client', label: 'Client' },
    { value: 'perdu', label: 'Perdu' }
  ];
  
  // Options de type
  const typeOptions = [
    { value: 'all', label: 'Tous les types' },
    { value: 'company', label: 'Entreprise' },
    { value: 'individual', label: 'Particulier' }
  ];
  
  // Mise à jour des filtres
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Réinitialiser tous les filtres
  const resetFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      type: 'all'
    });
  };
  
  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.search !== '' || filters.status !== 'all' || filters.type !== 'all';

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl overflow-hidden">
      {/* Barre de recherche toujours visible */}
      <div className="p-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher un lead..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 pl-10 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            🔍
          </span>
          {filters.search && (
            <motion.button
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleFilterChange('search', '')}
            >
              ✕
            </motion.button>
          )}
        </div>
      </div>
      
      {/* Bouton d'expansion des filtres */}
      <div 
        className="px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-700/30"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center text-sm">
          <span className="mr-2">🔍</span>
          <span className="text-gray-300 font-medium">Filtres avancés</span>
          {hasActiveFilters && (
            <span className="ml-2 px-1.5 py-0.5 bg-indigo-600 rounded-full text-xs text-white">
              {Object.values(filters).filter(val => val !== '' && val !== 'all').length}
            </span>
          )}
        </div>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="text-gray-400"
        >
          ⌄
        </motion.span>
      </div>
      
      {/* Filtres avancés (conditionnellement affichés) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-3 border-t border-gray-700/50">
              {/* Sélection du statut */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Statut</label>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.status === option.value
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleFilterChange('status', option.value)}
                    >
                      {option.label}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              {/* Sélection du type */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <div className="flex gap-2">
                  {typeOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.type === option.value
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleFilterChange('type', option.value)}
                    >
                      {option.label}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              {/* Bouton de réinitialisation */}
              {hasActiveFilters && (
                <div className="pt-2 flex justify-end">
                  <motion.button
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={resetFilters}
                  >
                    <span className="mr-1">↺</span>
                    Réinitialiser les filtres
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LeadFilter;