// src/components/goals/GoalFilter.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX } from 'react-icons/fi';

const GoalFilter = ({ filters, setFilters }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Options de catégorie
  const categoryOptions = [
    { value: 'all', label: 'Toutes les catégories' },
    { value: 'leads', label: 'Leads' },
    { value: 'revenue', label: 'Revenus' },
    { value: 'productivity', label: 'Productivité' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'personal', label: 'Personnel' }
  ];

  // Options de période
  const periodOptions = [
    { value: 'all', label: 'Toutes les périodes' },
    { value: 'monthly', label: 'Mensuel' },
    { value: 'quarterly', label: 'Trimestriel' },
    { value: 'yearly', label: 'Annuel' }
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
      category: 'all',
      period: 'all'
    });
  };
  
  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.search !== '' || 
    filters.category !== 'all' || 
    filters.period !== 'all';

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl mb-6 shadow-md relative z-30">
      {/* Barre de recherche toujours visible */}
      <div className="p-3 relative z-20">
        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher un objectif..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 pl-10 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent relative z-10"
          />
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-[15]">
            <FiSearch />
          </span>
          {filters.search && (
            <motion.button
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 z-[15]"
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
        className="px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-700/30 relative z-10"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center text-sm gap-2">
          <FiSearch />
          <span className="text-gray-300 font-medium">Filtres avancés</span>
          {hasActiveFilters && (
            <span className="ml-2 px-1.5 py-0.5 bg-amber-600 rounded-full text-xs text-white">
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
            className="relative z-[9]"
          >
            <div className="p-3 space-y-4 border-t border-gray-700/50">
              {/* Filtre par catégorie */}
              <div className="relative z-[8]">
                <label className="block text-xs text-gray-400 mb-1">Catégorie</label>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.category === option.value
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'bg-white text-gray-800 hover:bg-gray-100 shadow-sm'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleFilterChange('category', option.value)}
                    >
                      {option.icon && <span className="mr-1">{option.icon}</span>}
                      {option.label}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              {/* Filtre par période */}
              <div className="relative z-[8]">
                <label className="block text-xs text-gray-400 mb-1">Période</label>
                <div className="flex flex-wrap gap-2">
                  {periodOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.period === option.value
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'bg-white text-gray-800 hover:bg-gray-100 shadow-sm'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleFilterChange('period', option.value)}
                    >
                      {option.icon && <span className="mr-1">{option.icon}</span>}
                      {option.label}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              {/* Bouton de réinitialisation */}
              {hasActiveFilters && (
                <div className="pt-2 flex justify-end">
                  <motion.button
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center bg-gray-800/50 px-2 py-1 rounded-lg"
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

export default GoalFilter;