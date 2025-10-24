// src/components/calendar/CalendarHeader.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CalendarHeader = ({
  view,
  setView,
  currentDate,
  onPrevious,
  onNext,
  onToday,
  onAddEvent,
  filters,
  setFilters
}) => {
  const [showFilters, setShowFilters] = useState(false);
  
  // Options de catégorie
  const categoryOptions = [
    { value: 'all', label: 'Toutes les catégories' },
    { value: 'meeting', label: 'Réunion' },
    { value: 'deadline', label: 'Échéance' },
    { value: 'appointment', label: '📅 Rendez-vous' },
    { value: 'task', label: 'Tâche' },
    { value: 'reminder', label: '🔔 Rappel' },
    { value: 'personal', label: '🏠 Personnel' }
  ];
  
  // Options de priorité
  const priorityOptions = [
    { value: 'all', label: 'Toutes les priorités' },
    { value: 'high', label: '🔴 Haute' },
    { value: 'medium', label: '🟠 Moyenne' },
    { value: 'low', label: '🔵 Basse' }
  ];
  
  // Formater le titre de la vue actuelle
  const formatTitle = () => {
    const options = { month: 'long', year: 'numeric' };
    
    if (view === 'day') {
      options.day = 'numeric';
      return currentDate.toLocaleDateString('fr-FR', options);
    } else if (view === 'week') {
      const weekStart = new Date(currentDate);
      const weekEnd = new Date(currentDate);
      
      // Ajuster pour obtenir le début de la semaine (lundi)
      const dayOfWeek = currentDate.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0 = dimanche, 1 = lundi, etc.
      weekStart.setDate(currentDate.getDate() - diff);
      
      // Fin de la semaine (dimanche)
      weekEnd.setDate(weekStart.getDate() + 6);
      
      // Format différent si même mois ou mois différents
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${weekStart.getDate()} - ${weekEnd.getDate()} ${weekStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
      } else {
        return `${weekStart.getDate()} ${weekStart.toLocaleDateString('fr-FR', { month: 'long' })} - ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
      }
    } else {
      return currentDate.toLocaleDateString('fr-FR', options);
    }
  };
  
  // Mise à jour des filtres
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filters.search !== '' || 
    filters.category !== 'all' || 
    filters.priority !== 'all';
  
  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            <motion.button
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onPrevious}
            >
              ◀
            </motion.button>
            
            <motion.button
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToday}
            >
              Aujourd'hui
            </motion.button>
            
            <motion.button
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onNext}
            >
              ▶
            </motion.button>
          </div>
          
          <h2 className="text-2xl font-semibold text-white capitalize">
            {formatTitle()}
          </h2>
        </div>
        
        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <motion.button
            className="p-2 rounded-lg text-gray-300 hover:bg-gray-800/50 relative"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowFilters(!showFilters)}
          >
            🔍
            {hasActiveFilters && (
              <span className="absolute top-0 right-0 h-3 w-3 bg-indigo-600 rounded-full"></span>
            )}
          </motion.button>
          
          <div className="bg-gray-800/50 rounded-lg p-1 flex">
            <motion.button
              className={`px-3 py-1 rounded-lg text-sm ${
                view === 'month'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
              whileHover={{ scale: view === 'month' ? 1 : 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView('month')}
            >
              Mois
            </motion.button>
            <motion.button
              className={`px-3 py-1 rounded-lg text-sm ${
                view === 'week'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
              whileHover={{ scale: view === 'week' ? 1 : 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView('week')}
            >
              Semaine
            </motion.button>
            <motion.button
              className={`px-3 py-1 rounded-lg text-sm ${
                view === 'day'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
              whileHover={{ scale: view === 'day' ? 1 : 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView('day')}
            >
              Jour
            </motion.button>
          </div>
          
          <motion.button
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddEvent}
          >
            <span className="mr-2">+</span>
            Événement
          </motion.button>
        </div>
      </div>
      
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-4 overflow-hidden mb-4"
          >
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-gray-400 mb-1">Recherche</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Rechercher un événement..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 pl-10 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    🔍
                  </span>
                  {filters.search && (
                    <button
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      onClick={() => handleFilterChange('search', '')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              
              <div className="w-full sm:w-auto">
                <label className="block text-xs text-gray-400 mb-1">Catégorie</label>
                <select
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="bg-white text-gray-800 border border-gray-400 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                >
                  {categoryOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="w-full sm:w-auto">
                <label className="block text-xs text-gray-400 mb-1">Priorité</label>
                <select
                  value={filters.priority}
                  onChange={(e) => handleFilterChange('priority', e.target.value)}
                  className="bg-white text-gray-800 border border-gray-400 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                >
                  {priorityOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              {hasActiveFilters && (
                <motion.button
                  className="px-3 py-2 text-xs text-indigo-300 hover:text-indigo-200 flex items-center ml-auto"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setFilters({
                      search: '',
                      category: 'all',
                      priority: 'all'
                    });
                  }}
                >
                  <span className="mr-1">↺</span>
                  Réinitialiser
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CalendarHeader;