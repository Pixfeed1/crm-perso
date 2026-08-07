// src/components/calendar/CalendarHeader.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiX, FiPlus } from 'react-icons/fi';
import Button from '../common/Button';

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
    { value: 'appointment', label: 'Rendez-vous' },
    { value: 'task', label: 'Tâche' },
    { value: 'reminder', label: 'Rappel' },
    { value: 'personal', label: 'Personnel' }
  ];

  // Options de priorité
  const priorityOptions = [
    { value: 'all', label: 'Toutes les priorités' },
    { value: 'high', label: 'Haute' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'low', label: 'Basse' }
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
    <div className="mb-3 sm:mb-4">
      <div className="flex flex-col gap-2 sm:gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <div className="flex space-x-1.5 sm:space-x-2 w-full sm:w-auto">
            <motion.button
              className="p-2 sm:px-3 rounded-lg bg-surface-strong hover:bg-border-strong text-text-secondary flex-shrink-0 text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onPrevious}
            >
              ◀
            </motion.button>

            <motion.button
              className="px-2 sm:px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-secondary flex-1 sm:flex-initial whitespace-nowrap text-xs sm:text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToday}
            >
              Aujourd'hui
            </motion.button>

            <motion.button
              className="p-2 sm:px-3 rounded-lg bg-surface-strong hover:bg-border-strong text-text-secondary flex-shrink-0 text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onNext}
            >
              ▶
            </motion.button>
          </div>

          <h2 className="text-base sm:text-xl md:text-2xl font-semibold text-text-primary capitalize truncate">
            {formatTitle()}
          </h2>
        </div>

        <div className="flex flex-col gap-2 sm:gap-3 w-full sm:w-auto sm:justify-end">
          <div className="flex items-center gap-2 sm:gap-3 w-full">
            <motion.button
              className="p-2 rounded-lg text-text-secondary hover:bg-surface-strong relative flex-shrink-0"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowFilters(!showFilters)}
            >
              <FiSearch className="text-base sm:text-lg" />
              {hasActiveFilters && (
                <span className="absolute top-0 right-0 h-2.5 w-2.5 bg-accent rounded-full"></span>
              )}
            </motion.button>

            <div className="bg-surface-strong rounded-lg p-0.5 sm:p-1 flex flex-1 sm:flex-initial">
              <motion.button
                className={`flex-1 sm:flex-initial px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs sm:text-sm ${
                  view === 'month'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-border-strong'
                }`}
                whileHover={{ scale: view === 'month' ? 1 : 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setView('month')}
              >
                Mois
              </motion.button>
              <motion.button
                className={`flex-1 sm:flex-initial px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs sm:text-sm ${
                  view === 'week'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-border-strong'
                }`}
                whileHover={{ scale: view === 'week' ? 1 : 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setView('week')}
              >
                Semaine
              </motion.button>
              <motion.button
                className={`flex-1 sm:flex-initial px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs sm:text-sm ${
                  view === 'day'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-border-strong'
                }`}
                whileHover={{ scale: view === 'day' ? 1 : 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setView('day')}
              >
                Jour
              </motion.button>
            </div>
          </div>

          <Button
            variant="primary"
            icon={FiPlus}
            onClick={onAddEvent}
            className="w-full sm:w-auto"
          >
            Événement
          </Button>
        </div>
      </div>
      
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-surface-muted/50 backdrop-blur-sm rounded-xl p-3 sm:p-4 overflow-hidden mb-3 sm:mb-4"
          >
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-end">
              <div className="flex-1 min-w-full sm:min-w-[200px]">
                <label className="block text-xs text-text-muted mb-1.5 font-medium">Recherche</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Rechercher un événement..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="w-full bg-surface-muted border border-border rounded-lg px-3 sm:px-4 py-2 pl-9 sm:pl-10 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                  />
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted text-sm">
                    <FiSearch />
                  </span>
                  {filters.search && (
                    <button
                      className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary"
                      onClick={() => handleFilterChange('search', '')}
                    >
                      <FiX className="text-sm" />
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full sm:w-auto">
                <label className="block text-xs text-text-muted mb-1.5 font-medium">Catégorie</label>
                <select
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="w-full sm:w-48 bg-surface-muted border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                >
                  {categoryOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-auto">
                <label className="block text-xs text-text-muted mb-1.5 font-medium">Priorité</label>
                <select
                  value={filters.priority}
                  onChange={(e) => handleFilterChange('priority', e.target.value)}
                  className="w-full sm:w-48 bg-surface-muted border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
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
                  className="w-full sm:w-auto px-3 py-2 text-xs text-accent hover:brightness-110 flex items-center justify-center sm:justify-start sm:ml-auto"
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