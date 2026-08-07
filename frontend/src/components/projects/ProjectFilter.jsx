// src/components/projects/ProjectFilter.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX, FiFilter, FiArrowUp, FiArrowDown } from 'react-icons/fi';

const ProjectFilter = ({ filters, setFilters, onSort, sortField, sortDirection }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Options de statut
  const statusOptions = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'en-cours', label: 'En cours' },
    { value: 'planifié', label: 'Planifié' },
    { value: 'terminé', label: 'Terminé' },
    { value: 'pause', label: 'En pause' },
    { value: 'annulé', label: 'Annulé' }
  ];
  
  // Options de type
  const typeOptions = [
    { value: 'all', label: 'Tous les types' },
    { value: 'site-web', label: 'Site Web' },
    { value: 'application-mobile', label: 'Application Mobile' },
    { value: 'application-bureau', label: 'Application Bureau' },
    { value: 'design', label: 'Design' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'autre', label: 'Autre' }
  ];
  
  // Options de période
  const timeframeOptions = [
    { value: 'all', label: 'Toutes les périodes' },
    { value: 'current', label: 'Projets en cours' },
    { value: 'upcoming', label: 'Projets à venir' },
    { value: 'past', label: 'Projets passés' }
  ];

  // Options de tri
  const sortOptions = [
    { field: 'name', label: 'Nom' },
    { field: 'created_at', label: 'Date de création' },
    { field: 'end_date', label: 'Date de fin' },
    { field: 'status', label: 'Statut' }
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
      type: 'all',
      timeframe: 'all'
    });
  };
  
  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.search !== '' || filters.status !== 'all' || filters.type !== 'all' || filters.timeframe !== 'all';

  return (
    <div className="bg-surface/30 backdrop-blur-sm rounded-xl overflow-hidden">
      {/* Barre de recherche et tri toujours visible */}
      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          {/* Recherche */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Rechercher un projet..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 pl-10 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted">
              <FiSearch />
            </span>
            {filters.search && (
              <motion.button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary"
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
                      ? 'bg-purple-600 text-white'
                      : 'bg-surface-strong/50 text-text-secondary hover:bg-surface-strong'
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
        className="px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-surface-strong/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center text-sm">
          <span className="mr-2"><FiFilter /></span>
          <span className="text-text-secondary font-medium">Filtres avancés</span>
          {hasActiveFilters && (
            <span className="ml-2 px-1.5 py-0.5 bg-purple-600 rounded-full text-xs text-white">
              {Object.values(filters).filter(val => val !== '' && val !== 'all').length}
            </span>
          )}
        </div>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="text-text-primary"
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
            <div className="p-3 space-y-3 border-t border-border/50">
              {/* Sélection du statut */}
              <div>
                <label className="block text-xs text-text-primary mb-1">Statut</label>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.status === option.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-surface-strong/50 text-text-primary hover:bg-surface-strong'
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
                <label className="block text-xs text-text-primary mb-1">Type</label>
                <div className="flex flex-wrap gap-2">
                  {typeOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.type === option.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-surface-strong/50 text-text-primary hover:bg-surface-strong'
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
              
              {/* Sélection de la période */}
              <div>
                <label className="block text-xs text-text-primary mb-1">Période</label>
                <div className="flex flex-wrap gap-2">
                  {timeframeOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filters.timeframe === option.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-surface-strong/50 text-text-primary hover:bg-surface-strong'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleFilterChange('timeframe', option.value)}
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
                    className="text-xs text-purple-300 hover:text-purple-200 flex items-center"
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

export default ProjectFilter;