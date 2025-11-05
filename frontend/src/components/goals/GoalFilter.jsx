// src/components/goals/GoalFilter.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX, FiFilter, FiArrowUp, FiArrowDown } from 'react-icons/fi';

const GoalFilter = ({ filters, setFilters, onSort, sortField, sortDirection }) => {
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

  // Options de tri
  const sortOptions = [
    { field: 'name', label: 'Nom' },
    { field: 'deadline', label: 'Échéance' },
    { field: 'progress', label: 'Progression' },
    { field: 'created_at', label: 'Date de création' }
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
      {/* Barre de recherche et tri toujours visible */}
      <div className="p-3 space-y-3 relative z-20">
        <div className="flex gap-2">
          {/* Recherche */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Rechercher un objectif..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 pl-10 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent relative z-10"
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

          {/* Tri rapide */}
          {onSort && (
            <div className="flex gap-1">
              {sortOptions.map(option => (
                <motion.button
                  key={option.field}
                  onClick={() => onSort(option.field)}
                  className={`px-3 py-2 rounded-lg flex items-center gap-1 text-sm ${
                    sortField === option.field
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="hidden sm:inline">{option.label}</span>
                  <span className="sm:hidden">{option.label.substring(0, 3)}</span>
                  {sortField === option.field && (
                    sortDirection === 'asc' ? <FiArrowUp size={14} /> : <FiArrowDown size={14} />
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Bouton d'expansion des filtres */}
      <div
        className="px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-700/30 transition-colors relative z-10"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center text-sm gap-2">
          <FiFilter />
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
                          : 'bg-gray-800/50 text-white hover:bg-gray-700 shadow-sm'
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
                          : 'bg-gray-800/50 text-white hover:bg-gray-700 shadow-sm'
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