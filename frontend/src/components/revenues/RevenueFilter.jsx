// src/components/revenues/RevenueFilter.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX } from 'react-icons/fi';

const RevenueFilter = ({ filters, setFilters, projects }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Options de type
  const typeOptions = [
    { value: 'all', label: 'Tous les types' },
    { value: 'invoice', label: 'Facture' },
    { value: 'recurring', label: 'Récurrent' },
    { value: 'other', label: 'Autre' }
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
      type: 'all',
      minAmount: '',
      maxAmount: '',
      project: 'all'
    });
  };
  
  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.search !== '' || 
    filters.type !== 'all' || 
    filters.minAmount !== '' || 
    filters.maxAmount !== '' || 
    filters.project !== 'all';

  // Styles CSS pour les éléments de recherche
  const searchContainerStyle = {
    position: 'relative',
    zIndex: 20
  };
  
  const searchInputStyle = {
    position: 'relative',
    zIndex: 10
  };
  
  const iconStyle = {
    zIndex: 15
  };

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl mb-6">
      {/* Barre de recherche toujours visible */}
      <div className="p-3" style={searchContainerStyle}>
        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher un revenu..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 pl-10 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            style={searchInputStyle}
          />
          <span 
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
            style={iconStyle}
          >
            <FiSearch />
          </span>
          {filters.search && (
            <motion.button
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              style={iconStyle}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleFilterChange('search', '')}
            >
              <FiX />
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
          <span className="mr-2"><FiSearch /></span>
          <span className="text-gray-300 font-medium">Filtres avancés</span>
          {hasActiveFilters && (
            <span className="ml-2 px-1.5 py-0.5 bg-teal-600 rounded-full text-xs text-white">
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
            <div className="p-3 space-y-4 border-t border-gray-700/50">
              {/* Filtre par type */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type de revenu</label>
                <div className="flex flex-wrap gap-2">
                  {typeOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.type === option.value
                          ? 'bg-teal-600 text-white'
                          : 'bg-white text-gray-800 hover:bg-gray-100'
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
              
              {/* Filtre par montant */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="minAmount" className="block text-xs text-gray-400 mb-1">
                    Montant minimum
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      id="minAmount"
                      value={filters.minAmount}
                      onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                      className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 pl-8 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      placeholder="Min"
                      min="0"
                    />
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      €
                    </span>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="maxAmount" className="block text-xs text-gray-400 mb-1">
                    Montant maximum
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      id="maxAmount"
                      value={filters.maxAmount}
                      onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                      className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 pl-8 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      placeholder="Max"
                      min="0"
                    />
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                      €
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Filtre par projet */}
              <div>
                <label htmlFor="project" className="block text-xs text-gray-400 mb-1">
                  Projet associé
                </label>
                <select
                  id="project"
                  value={filters.project}
                  onChange={(e) => handleFilterChange('project', e.target.value)}
                  className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="all">Tous les projets</option>
                  <option value="none">Sans projet</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id.toString()}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Bouton de réinitialisation */}
              {hasActiveFilters && (
                <div className="pt-2 flex justify-end">
                  <motion.button
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center bg-gray-700/50 px-2 py-1 rounded"
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

export default RevenueFilter;