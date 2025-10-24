// src/components/calendar/MonthView.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

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
      <div className="grid grid-cols-7 text-center border-b border-gray-700">
        {weekdays.map((day, index) => (
          <div key={index} className="py-2 text-gray-400 font-medium text-sm">
            {day}
          </div>
        ))}
      </div>
      
      {/* Grille du calendrier */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 border-b border-gray-700">
        {daysInMonth.map((day, index) => (
          <div 
            key={index}
            className={`min-h-[80px] md:min-h-[100px] border-r border-b border-gray-700 flex flex-col ${
              day.isCurrentMonth ? 'bg-transparent' : 'bg-gray-900/30'
            } ${day.isToday ? 'bg-indigo-900/20' : ''}`}
            onClick={() => onSelectDate(day.date)}
          >
            {/* Numéro du jour */}
            <div className={`text-right p-1 ${
              day.isCurrentMonth 
                ? day.isToday ? 'text-indigo-300 font-bold' : 'text-white' 
                : 'text-gray-600'
            }`}>
              {formatDayNumber(day.date)}
            </div>
            
            {/* Événements du jour */}
            <div className="flex-1 p-1 space-y-1 overflow-hidden">
              {getEventsForDay(day.date).slice(0, 3).map((event, eventIndex) => (
                <motion.div
                  key={event.id}
                  className={`px-2 py-1 text-xs rounded truncate cursor-pointer border-l-2 ${
                    categoryColors[event.category] || 'bg-gray-600/80 text-gray-100'
                  } ${priorityColors[event.priority] || 'border-l-gray-400'} ${
                    selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-white' : ''
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(event);
                  }}
                >
                  {event.all_day ? '📅 ' : '🕓 '}
                  {event.title}
                </motion.div>
              ))}
              
              {/* Indiquer s'il y a plus d'événements que ceux affichés */}
              {getEventsForDay(day.date).length > 3 && (
                <div className="text-xs text-indigo-300 text-center">
                  +{getEventsForDay(day.date).length - 3} de plus
                </div>
              )}
              
              {day.isCurrentMonth && (
                <motion.button
                  className="w-full mt-1 text-xs text-indigo-300 hover:text-indigo-200 opacity-0 hover:opacity-100 flex justify-center items-center"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddEvent(day.date);
                  }}
                >
                  <span className="mr-1">+</span> Ajouter
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