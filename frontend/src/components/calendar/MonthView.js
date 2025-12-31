// src/components/calendar/MonthView.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiCalendar, FiClock } from 'react-icons/fi';

const MonthView = ({ 
  currentDate, 
  events, 
  onSelectDate, 
  onSelectEvent, 
  selectedEvent,
  onAddEvent
}) => {
  // Noms des jours de la semaine
  const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  
  // Générer les jours du mois actuel
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Obtenir le premier jour du mois
    const firstDayOfMonth = new Date(year, month, 1);
    // Obtenir le dernier jour du mois
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // Ajuster pour commencer avec le lundi (1) plutôt que le dimanche (0)
    let firstWeekday = firstDayOfMonth.getDay();
    firstWeekday = firstWeekday === 0 ? 7 : firstWeekday; // Dimanche devient 7 au lieu de 0
    
    // Calculer le nombre de jours à afficher depuis le mois précédent
    const daysFromPrevMonth = firstWeekday - 1;
    
    // Calculer le nombre total de jours à afficher
    const totalDays = daysFromPrevMonth + lastDayOfMonth.getDate();
    // Arrondir au multiple de 7 supérieur pour compléter les semaines
    const totalCells = Math.ceil(totalDays / 7) * 7;
    
    // Générer un tableau de dates pour toutes les cellules
    const days = [];
    
    // Ajouter les jours du mois précédent
    const prevMonth = new Date(year, month - 1, 1);
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    for (let i = 0; i < daysFromPrevMonth; i++) {
      const day = daysInPrevMonth - daysFromPrevMonth + i + 1;
      days.push({
        date: new Date(year, month - 1, day),
        isCurrentMonth: false,
        isToday: false
      });
    }
    
    // Ajouter les jours du mois actuel
    const today = new Date();
    const isToday = (date) => {
      return date.getDate() === today.getDate() &&
             date.getMonth() === today.getMonth() &&
             date.getFullYear() === today.getFullYear();
    };
    
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const date = new Date(year, month, i);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: isToday(date)
      });
    }
    
    // Ajouter les jours du mois suivant
    const remainingCells = totalCells - days.length;
    
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
        isToday: false
      });
    }
    
    return days;
  }, [currentDate]);
  
  // Filtrer les événements par jour
  const getEventsForDay = (date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start_datetime);
      return eventDate.getDate() === date.getDate() &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getFullYear() === date.getFullYear();
    });
  };
  
  // Configuration des couleurs de catégorie
  const categoryColors = {
    'meeting': 'bg-blue-500/80 text-blue-100',
    'call': 'bg-green-500/80 text-green-100',
    'deadline': 'bg-amber-500/80 text-amber-100',
    'task': 'bg-purple-500/80 text-purple-100',
    'personal': 'bg-rose-500/80 text-rose-100'
  };
  
  // Configuration des couleurs de priorité
  const priorityColors = {
    'low': 'border-l-gray-400',
    'medium': 'border-l-indigo-400',
    'high': 'border-l-amber-400',
    'critical': 'border-l-rose-500'
  };
  
  // Formater la date
  const formatDayNumber = (date) => {
    return date.getDate();
  };
  
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* En-tête des jours de la semaine */}
      <div className="grid grid-cols-7 text-center border-b border-gray-700/50">
        {weekdays.map((day, index) => (
          <div key={index} className="py-2 sm:py-2.5 text-gray-400 font-semibold text-[11px] sm:text-sm">
            {day}
          </div>
        ))}
      </div>

      {/* Grille du calendrier */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr border-b border-gray-700/50">
        {daysInMonth.map((day, index) => (
          <div
            key={index}
            className={`min-h-[75px] sm:min-h-[95px] lg:min-h-[105px] border-r border-b border-gray-700/50 flex flex-col cursor-pointer transition-colors hover:bg-gray-700/20 ${
              day.isCurrentMonth ? 'bg-transparent' : 'bg-gray-900/40'
            } ${day.isToday ? 'bg-indigo-900/30 ring-1 ring-indigo-600/30' : ''}`}
            onClick={() => onSelectDate(day.date)}
          >
            {/* Numéro du jour */}
            <div className={`text-center sm:text-right px-1 py-1 text-xs sm:text-sm font-medium ${
              day.isCurrentMonth
                ? day.isToday ? 'text-indigo-300 font-bold' : 'text-gray-200'
                : 'text-gray-600'
            }`}>
              {formatDayNumber(day.date)}
            </div>

            {/* Événements du jour */}
            <div className="flex-1 px-1 py-0.5 space-y-0.5 overflow-hidden">
              {getEventsForDay(day.date).slice(0, 2).map((event, eventIndex) => (
                <motion.div
                  key={event.id}
                  className={`px-1.5 py-1 text-[9px] sm:text-[10px] lg:text-xs rounded cursor-pointer border-l-2 flex items-center gap-1 ${
                    categoryColors[event.category] || 'bg-gray-600/80 text-gray-100'
                  } ${priorityColors[event.priority] || 'border-l-gray-400'} ${
                    selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-indigo-400' : ''
                  } hover:brightness-110`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(event);
                  }}
                >
                  {event.all_day ? <FiCalendar className="flex-shrink-0 text-[9px] sm:text-[10px]" /> : <FiClock className="flex-shrink-0 text-[9px] sm:text-[10px]" />}
                  <span className="truncate font-medium">{event.title}</span>
                </motion.div>
              ))}

              {/* Indiquer s'il y a plus d'événements que ceux affichés */}
              {getEventsForDay(day.date).length > 2 && (
                <div className="text-[9px] sm:text-[10px] lg:text-xs text-indigo-400 text-center font-semibold py-0.5 cursor-pointer hover:text-indigo-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDate(day.date);
                  }}
                >
                  +{getEventsForDay(day.date).length - 2} autres
                </div>
              )}

              {day.isCurrentMonth && getEventsForDay(day.date).length === 0 && (
                <motion.button
                  className="w-full mt-1 text-[9px] sm:text-[10px] text-indigo-400 hover:text-indigo-300 opacity-0 hover:opacity-100 flex justify-center items-center py-1 rounded hover:bg-indigo-600/20 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddEvent(day.date);
                  }}
                >
                  <span className="mr-1">+</span> <span className="hidden sm:inline">Ajouter</span><span className="sm:hidden">+</span>
                </motion.button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MonthView;