// src/components/leads/LeadFilter.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX, FiFilter, FiArrowUp, FiArrowDown } from 'react-icons/fi';

const LeadFilter = ({ filters, setFilters, onSort, sortField, sortDirection, isKanbanView = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Options de statut (alignées avec le Kanban)
  const statusOptions = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'new', label: 'Nouveau' },
    { value: 'contacted', label: 'Contacté' },
    { value: 'proposal', label: 'Proposition' },
    { value: 'negotiation', label: 'Négociation' },
    { value: 'won', label: 'Gagné' },
    { value: 'lost', label: 'Perdu' }
  ];

  // Options de type
  const typeOptions = [
    { value: 'all', label: 'Tous les types' },
    { value: 'company', label: 'Entreprise' },
    { value: 'individual', label: 'Particulier' }
  ];

  // Options de source
  const sourceOptions = [
    { value: 'all', label: 'Toutes les sources' },
    { value: 'Site Web', label: 'Site Web' },
    { value: 'Référence', label: 'Référence' },
    { value: 'LinkedIn', label: 'LinkedIn' },
    { value: 'Email', label: 'Email' },
    { value: 'Téléphone', label: 'Téléphone' },
    { value: 'Contact direct', label: 'Contact direct' },
    { value: 'Autre', label: 'Autre' }
  ];

  // Options de tri
  const sortOptions = [
    { field: 'name', label: 'Nom' },
    { field: 'created_at', label: 'Date de création' },
    { field: 'updated_at', label: 'Dernière modification' },
    { field: 'company', label: 'Entreprise' }
  ];

  // Mise à jour des filtres
  const handleFilterChange = (field, value) => {
    console.log('[LeadFilter] Changement de filtre:', { field, value });
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
      source: 'all',
      dateFrom: '',
      dateTo: ''
    });
  };

  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.search !== '' ||
    filters.status !== 'all' ||
    filters.type !== 'all' ||
    filters.source !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl overflow-hidden">
      {/* Barre de recherche et tri toujours visible */}
      <div className="p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Recherche */}
          <div className="flex-1 w-full relative">
            <input
              type="text"
              placeholder="Rechercher un lead..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 pl-10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              <FiSearch />
            </span>
            {filters.search && (
              <motion.button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
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
            <div className="grid grid-cols-2 sm:flex gap-1 w-full sm:w-auto">
              {sortOptions.map(option => (
                <motion.button
                  key={option.field}
                  onClick={() => onSort(option.field)}
                  className={`px-3 py-2 rounded-lg flex items-center justify-center gap-1 text-sm ${
                    sortField === option.field
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="hidden sm:inline">{option.label}</span>
                  <span className="sm:hidden text-xs">{option.label}</span>
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
        className="px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-700/30 transition-colors"
        onClick={() => {
          console.log('[LeadFilter] Toggle expansion:', !isExpanded);
          setIsExpanded(!isExpanded);
        }}
      >
        <div className="flex items-center text-sm">
          <span className="mr-2"><FiFilter /></span>
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
            <div className="p-3 space-y-4 border-t border-gray-700/50">
              {/* Sélection du statut (masqué en vue Kanban car redondant) */}
              {!isKanbanView && (
                <div>
                  <label className="block text-xs text-gray-400 mb-2 font-medium">Statut</label>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map(option => (
                      <motion.button
                        key={option.value}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
              )}

              {/* Sélection du type */}
              <div>
                <label className="block text-xs text-gray-400 mb-2 font-medium">Type</label>
                <div className="flex gap-2">
                  {typeOptions.map(option => (
                    <motion.button
                      key={option.value}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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

              {/* Sélection de la source */}
              <div>
                <label className="block text-xs text-gray-400 mb-2 font-medium">Source</label>
                <select
                  value={filters.source || 'all'}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {sourceOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtres par date */}
              <div>
                <label className="block text-xs text-gray-400 mb-2 font-medium">Période de création</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      type="date"
                      value={filters.dateFrom || ''}
                      onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      placeholder="Du"
                    />
                    <span className="text-xs text-gray-500 mt-1 block">Du</span>
                  </div>
                  <div>
                    <input
                      type="date"
                      value={filters.dateTo || ''}
                      onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      placeholder="Au"
                    />
                    <span className="text-xs text-gray-500 mt-1 block">Au</span>
                  </div>
                </div>
              </div>

              {/* Bouton de réinitialisation */}
              {hasActiveFilters && (
                <div className="pt-2 flex justify-end">
                  <motion.button
                    className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={resetFilters}
                  >
                    <FiX size={16} />
                    Réinitialiser tous les filtres
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