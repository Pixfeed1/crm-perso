// src/components/calendar/WeekView.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiUsers, FiPhone, FiClock, FiCheck, FiHome, FiClipboard, FiCalendar, FiMapPin } from 'react-icons/fi';

const WeekView = ({ 
  currentDate, 
  events, 
  onSelectDate, 
  onSelectEvent, 
  selectedEvent,
  onAddEvent
}) => {
  // Noms des jours de la semaine
  const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Heures à afficher (de 8h à 20h)
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);
  
  // Générer les jours de la semaine actuelle
  const daysInWeek = useMemo(() => {
    const result = [];
    
    // Trouver le premier jour de la semaine (lundi)
    const firstDayOfWeek = new Date(currentDate);
    const day = currentDate.getDay();
    const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
    firstDayOfWeek.setDate(diff);
    
    // Ajouter tous les jours de la semaine
    for (let i = 0; i < 7; i++) {
      const date = new Date(firstDayOfWeek);
      date.setDate(date.getDate() + i);
      
      const today = new Date();
      const isToday = 
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
      
      result.push({
        date,
        isToday
      });
    }
    
    return result;
  }, [currentDate]);

  // Formatter la date du jour
  const formatDate = (date) => {
    return date.getDate();
  };
  
  // Formatter l'heure
  const formatHour = (hour) => {
    return `${hour}:00`;
  };

  // Filtrer les événements par jour
  const getEventsForDay = (date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start_datetime);
      return eventDate.getDate() === date.getDate() &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getFullYear() === date.getFullYear();
    });
  };
  
  // Calculer la position et la hauteur d'un événement dans la grille
  const calculateEventPosition = (event) => {
    const startDateTime = new Date(event.start_datetime);
    const endDateTime = new Date(event.end_datetime);
    
    const startHour = startDateTime.getHours() + startDateTime.getMinutes() / 60;
    const endHour = endDateTime.getHours() + endDateTime.getMinutes() / 60;
    
    // Ajuster si l'événement commence avant 8h ou se termine après 20h
    const gridStartHour = Math.max(startHour, 8);
    const gridEndHour = Math.min(endHour, 21);
    
    // Calculer la position top et la hauteur en pourcentage de la journée visible (8h-20h = 12h)
    const top = ((gridStartHour - 8) / 13) * 100;
    const height = ((gridEndHour - gridStartHour) / 13) * 100;
    
    return {
      top: `${top}%`,
      height: `${height}%`,
      startsBefore: startHour < 8,
      endsAfter: endHour > 21
    };
  };
  
  // Configuration des couleurs de catégorie
  const categoryColors = {
    'meeting': 'bg-blue-500/80 text-blue-100 border-blue-400',
    'call': 'bg-green-500/80 text-green-100 border-green-400',
    'deadline': 'bg-amber-500/80 text-amber-100 border-amber-400',
    'task': 'bg-purple-500/80 text-purple-100 border-purple-400',
    'personal': 'bg-rose-500/80 text-rose-100 border-rose-400'
  };
  
  // Configuration des icônes de catégorie
  const categoryIcons = {
    'meeting': <FiUsers />,
    'call': <FiPhone />,
    'deadline': <FiClock />,
    'task': <FiCheck />,
    'personal': <FiHome />
  };
  
  // Configuration des couleurs de priorité
  const priorityColors = {
    'low': 'border-l-gray-400',
    'medium': 'border-l-indigo-400',
    'high': 'border-l-amber-400',
    'critical': 'border-l-rose-500'
  };
  
  // Formatter l'heure de l'événement
  const formatEventTime = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Version desktop - visible uniquement sur md et plus */}
      <div className="hidden md:block flex-1">
        <div className="grid grid-cols-8 border-b border-gray-700">
          {/* Cellule vide pour l'angle supérieur gauche */}
          <div className="border-r border-gray-700 p-2"></div>
          
          {/* Jours de la semaine */}
          {daysInWeek.map((day, index) => (
            <div 
              key={index}
              className={`p-2 text-center border-r border-gray-700 cursor-pointer 
                ${day.isToday ? 'bg-indigo-900/20' : ''}`}
              onClick={() => onSelectDate(day.date)}
            >
              <div className="text-gray-400 text-xs">{weekdays[index]}</div>
              <div className={`text-lg font-medium ${day.isToday ? 'text-indigo-300' : 'text-white'}`}>
                {formatDate(day.date)}
              </div>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-8 relative flex-1">
          {/* Colonne des heures */}
          <div className="border-r border-gray-700">
            {hours.map(hour => (
              <div 
                key={hour} 
                className="h-20 border-b border-gray-700 p-2 text-right text-gray-400 text-sm"
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>
          
          {/* Colonnes des jours */}
          {daysInWeek.map((day, dayIndex) => (
            <div 
              key={dayIndex} 
              className={`border-r border-gray-700 relative ${
                day.isToday ? 'bg-indigo-900/10' : ''
              }`}
            >
              {/* Lignes des heures (grille) */}
              {hours.map(hour => (
                <div 
                  key={hour} 
                  className="h-20 border-b border-gray-700"
                  onClick={() => {
                    // Créer une date avec l'heure sélectionnée
                    const newDate = new Date(day.date);
                    newDate.setHours(hour, 0, 0, 0);
                    onAddEvent(newDate);
                  }}
                ></div>
              ))}
              
              {/* Événements du jour */}
              <div className="absolute inset-0 p-1">
                {getEventsForDay(day.date).map(event => {
                  const position = calculateEventPosition(event);
                  return (
                    <motion.div
                      key={event.id}
                      className={`absolute left-1 right-1 p-1 rounded-md border-l-2 border 
                        ${categoryColors[event.category] || 'bg-gray-600/80 text-gray-100 border-gray-500'} 
                        ${priorityColors[event.priority] || 'border-l-gray-400'} 
                        ${selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-white' : ''}
                        ${position.startsBefore ? 'rounded-t-none border-t-dashed' : ''}
                        ${position.endsAfter ? 'rounded-b-none border-b-dashed' : ''}
                      `}
                      style={{
                        top: position.top,
                        height: position.height
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onSelectEvent(event)}
                    >
                      <div className="text-xs font-medium truncate flex items-center gap-1">
                        {event.all_day ? <><FiCalendar /> Toute la journée</> : formatEventTime(event.start_datetime)}
                      </div>
                      <div className="font-medium truncate text-sm">
                        {event.title}
                      </div>
                      {position.height > 15 && (
                        <div className="text-xs mt-1 truncate flex items-center gap-1">
                          {categoryIcons[event.category] || <FiClipboard />} {event.location || ''}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Version mobile - visible uniquement en dessous de md */}
      <div className="md:hidden flex flex-col">
        <div className="p-4 text-center border-b border-gray-700">
          <h3 className="text-lg font-medium text-gray-300">
            Vue semaine
          </h3>
          <p className="text-sm text-gray-400">Sélectionnez un jour pour voir les détails</p>
        </div>
        <div className="grid grid-cols-7 gap-2 p-4">
          {daysInWeek.map((day, index) => (
            <div 
              key={index}
              className={`p-2 text-center rounded-lg cursor-pointer 
                ${day.isToday ? 'bg-indigo-900/50' : 'bg-gray-800/50'}`}
              onClick={() => onSelectDate(day.date)}
            >
              <div className="text-gray-400 text-xs">{weekdays[index]}</div>
              <div className={`text-lg font-medium ${day.isToday ? 'text-indigo-300' : 'text-white'}`}>
                {formatDate(day.date)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {getEventsForDay(day.date).length} événements
              </div>
            </div>
          ))}
        </div>
        
        {/* Liste des événements pour aujourd'hui ou le jour sélectionné */}
        <div className="flex-1 p-4">
          <h4 className="text-md font-medium text-gray-300 mb-3">
            Événements ({daysInWeek.find(d => d.isToday) ? 'Aujourd\'hui' : 'Jour sélectionné'})
          </h4>
          <div className="space-y-2">
            {getEventsForDay(daysInWeek.find(d => d.isToday)?.date || daysInWeek[0].date).map(event => (
              <motion.div
                key={event.id}
                className={`p-3 rounded-lg cursor-pointer border-l-2 ${
                  categoryColors[event.category] || 'bg-gray-600/80 text-gray-100 border-gray-500'
                } ${
                  selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-white' : ''
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectEvent(event)}
              >
                <div className="flex justify-between items-start">
                  <div className="font-medium">{event.title}</div>
                  <div className="text-xs">
                    {event.all_day ? 'Toute la journée' : formatEventTime(event.start_datetime)}
                  </div>
                </div>
                {event.location && (
                  <div className="text-xs mt-1 flex items-center gap-1">
                    <FiMapPin /> {event.location}
                  </div>
                )}
                <div className="text-xs mt-1 flex items-center gap-1">
                  {categoryIcons[event.category] || <FiClipboard />}
                  {event.category === 'meeting' ? 'Réunion' : 
                   event.category === 'call' ? 'Appel' :
                   event.category === 'deadline' ? 'Échéance' :
                   event.category === 'task' ? 'Tâche' :
                   event.category === 'personal' ? 'Personnel' : 'Événement'}
                </div>
              </motion.div>
            ))}
            
            {getEventsForDay(daysInWeek.find(d => d.isToday)?.date || daysInWeek[0].date).length === 0 && (
              <div className="text-center text-gray-400 py-6">
                <div className="text-3xl mb-2"><FiCalendar /></div>
                <p>Aucun événement pour ce jour</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeekView;