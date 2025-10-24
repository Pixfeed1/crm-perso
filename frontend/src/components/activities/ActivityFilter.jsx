// src/components/activities/ActivityFilter.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const ActivityFilter = ({ 
  filters, 
  setFilters, 
  projects,
  startDate,
  endDate,
  onPeriodChange 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);
  
  // Options de type
  const typeOptions = [
    { value: 'all', label: 'Tous les types' },
    { value: 'development', label: '💻 Développement' },
    { value: 'design', label: '🎨 Design' },
    { value: 'meeting', label: '👥 Réunion' },
    { value: 'call', label: '📞 Appel' },
    { value: 'marketing', label: '📢 Marketing' },
    { value: 'maintenance', label: '🔧 Maintenance' }
  ];
  
  // Options de priorité
  const priorityOptions = [
    { value: 'all', label: 'Toutes les priorités' },
    { value: 'high', label: '🔴 Haute' },
    { value: 'medium', label: '🟠 Moyenne' },
    { value: 'low', label: '🔵 Basse' }
  ];
  
  // Options de statut
  const statusOptions = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'pending', label: '⏳ En attente' },
    { value: 'completed', label: '✅ Terminé' }
  ];
  
  // Options de période prédéfinies
  const periodOptions = [
    { label: 'Aujourd\'hui', action: () => setPeriod('today') },
    { label: 'Hier', action: () => setPeriod('yesterday') },
    { label: 'Cette semaine', action: () => setPeriod('thisWeek') },
    { label: 'Semaine dernière', action: () => setPeriod('lastWeek') },
    { label: 'Ce mois', action: () => setPeriod('thisMonth') },
    { label: 'Mois dernier', action: () => setPeriod('lastMonth') }
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
      priority: 'all',
      status: 'all',
      project: 'all'
    });
  };
  
  // Mettre à jour la période
  const setPeriod = (period) => {
    const now = new Date();
    let start, end;
    
    if (period === 'today') {
      start = new Date(now.setHours(0, 0, 0, 0));
      end = new Date(now.setHours(23, 59, 59, 999));
    } else if (period === 'yesterday') {
      start = new Date(now.setHours(0, 0, 0, 0));
      start.setDate(start.getDate() - 1);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'thisWeek') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Sunday
      start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'lastWeek') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) - 7; // Last week
      start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'thisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'lastMonth') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
    }
    
    setLocalStartDate(start);
    setLocalEndDate(end);
    onPeriodChange(start, end);
  };
  
  // Appliquer la plage de dates personnalisée
  const applyCustomDateRange = () => {
    if (localStartDate && localEndDate) {
      onPeriodChange(localStartDate, localEndDate);
    }
  };
  
  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.search !== '' || 
    filters.type !== 'all' || 
    filters.priority !== 'all' || 
    filters.status !== 'all' || 
    filters.project !== 'all';
  
  return (
    <div className="flex-1 max-w-full">
      {/* Filtres de période */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl overflow-hidden mb-4">
        <div className="flex flex-wrap p-2 gap-2">
          {periodOptions.map((option, index) => (
            <motion.button
              key={index}
              className="px-3 py-1 bg-white text-gray-800 hover:bg-gray-100 rounded-lg text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={option.action}
            >
              {option.label}
            </motion.button>
          ))}
        </div>
        
        <div className="p-3 border-t border-gray-700/50 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Du</label>
            <DatePicker
              selected={localStartDate}
              onChange={date => setLocalStartDate(date)}
              dateFormat="dd/MM/yyyy"
              className="bg-white text-gray-800 border border-gray-400 rounded-lg px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-400 mb-1">Au</label>
            <DatePicker
              selected={localEndDate}
              onChange={date => setLocalEndDate(date)}
              dateFormat="dd/MM/yyyy"
              className="bg-white text-gray-800 border border-gray-400 rounded-lg px-3 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <motion.button
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={applyCustomDateRange}
          >
            Appliquer
          </motion.button>
        </div>
      </div>
      
      {/* Barre de recherche */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl overflow-hidden w-full">
        <div className="p-3">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Rechercher une activité..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 pl-10 pr-8 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
              🔍
            </span>
            {filters.search && (
              <motion.button
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
              <div className="p-3 space-y-4 border-t border-gray-700/50">
                {/* Filtre par type */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Type d'activité</label>
                  <div className="flex flex-wrap gap-2">
                    {typeOptions.map(option => (
                      <motion.button
                        key={option.value}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          filters.type === option.value
                            ? 'bg-indigo-600 text-white'
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
                
                {/* Filtre par priorité */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Priorité</label>
                  <div className="flex flex-wrap gap-2">
                    {priorityOptions.map(option => (
                      <motion.button
                        key={option.value}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          filters.priority === option.value
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-800 hover:bg-gray-100'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleFilterChange('priority', option.value)}
                      >
                        {option.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
                
                {/* Filtre par statut */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Statut</label>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map(option => (
                      <motion.button
                        key={option.value}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          filters.status === option.value
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-800 hover:bg-gray-100'
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
                
                {/* Filtre par projet */}
                <div>
                  <label htmlFor="project" className="block text-xs text-gray-400 mb-1">
                    Projet associé
                  </label>
                  <select
                    id="project"
                    value={filters.project}
                    onChange={(e) => handleFilterChange('project', e.target.value)}
                    className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center bg-gray-700/50 px-2 py-1 rounded"
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
    </div>
  );
};

export default ActivityFilter;