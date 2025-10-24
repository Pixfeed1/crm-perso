// src/components/calendar/DayView.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiUsers, FiPhone, FiClock, FiCheck, FiHome, FiClipboard, FiCalendar } from 'react-icons/fi';

const DayView = ({
  currentDate,
  events,
  onSelectEvent,
  selectedEvent,
  onAddEvent
}) => {
  // Heures à afficher (de 7h à 22h)
  const hours = Array.from({ length: 16 }, (_, i) => i + 7);

  // Filtrer les événements du jour sélectionné
  const todayEvents = events.filter(event => {
    const eventDate = new Date(event.start_datetime);
    return eventDate.getDate() === currentDate.getDate() &&
           eventDate.getMonth() === currentDate.getMonth() &&
           eventDate.getFullYear() === currentDate.getFullYear();
  });

  // Trier les événements par heure de début
  const sortedEvents = [...todayEvents].sort((a, b) => {
    return new Date(a.start_datetime) - new Date(b.start_datetime);
  });

  // Événements sur toute la journée
  const allDayEvents = sortedEvents.filter(event => event.all_day);

  // Événements à heures fixes
  const timedEvents = sortedEvents.filter(event => !event.all_day);

  // Formatter l'heure
  const formatHour = (hour) => {
    return `${hour}:00`;
  };

  // Formatter l'heure de l'événement
  const formatEventTime = (startDate, endDate) => {
    const formatTime = (date) => {
      return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    };

    return `${formatTime(startDate)} - ${formatTime(endDate)}`;
  };

  // Calculer la position et la hauteur d'un événement dans la grille
  const calculateEventPosition = (event) => {
    const startDateTime = new Date(event.start_datetime);
    const endDateTime = new Date(event.end_datetime);

    const startHour = startDateTime.getHours() + startDateTime.getMinutes() / 60;
    const endHour = endDateTime.getHours() + endDateTime.getMinutes() / 60;

    // Ajuster si l'événement commence avant 7h ou se termine après 22h
    const gridStartHour = Math.max(startHour, 7);
    const gridEndHour = Math.min(endHour, 23);

    // Calculer la position top et la hauteur en pourcentage de la journée visible (7h-22h = 16h)
    const top = ((gridStartHour - 7) / 16) * 100;
    const height = ((gridEndHour - gridStartHour) / 16) * 100;

    return {
      top: `${top}%`,
      height: `${height}%`,
      startsBefore: startHour < 7,
      endsAfter: endHour > 23
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
  
  // Formatter le jour
  const formatDay = () => {
    return new Intl.DateTimeFormat('fr-FR', { 
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(currentDate);
  };
  
  // Vérifier si la date est aujourd'hui
  const isToday = () => {
    const today = new Date();
    return currentDate.getDate() === today.getDate() &&
           currentDate.getMonth() === today.getMonth() &&
           currentDate.getFullYear() === today.getFullYear();
  };
  
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* En-tête avec la date du jour */}
      <div className="p-3 border-b border-gray-700 flex justify-between items-center">
        <h3 className={`text-lg font-medium capitalize ${isToday() ? 'text-indigo-300' : 'text-white'}`}>
          {formatDay()}
          {isToday() && <span className="ml-2 text-sm text-indigo-400">(Aujourd'hui)</span>}
        </h3>
        
        <motion.button
          className="px-3 py-1 bg-indigo-600/70 hover:bg-indigo-600 text-white rounded-lg text-sm flex items-center"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAddEvent(currentDate)}
        >
          <span className="mr-1">+</span>
          Ajouter
        </motion.button>
      </div>
      
      {/* Événements sur toute la journée */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-gray-700">
          <div className="py-1 px-3 bg-gray-800/50 text-gray-400 text-xs font-medium">
            Toute la journée
          </div>
          <div className="p-2 space-y-1">
            {allDayEvents.map(event => (
              <motion.div
                key={event.id}
                className={`px-3 py-2 rounded-md cursor-pointer border-l-2 ${
                  categoryColors[event.category] || 'bg-gray-600/80 text-gray-100 border-gray-500'
                } ${selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-white' : ''}`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelectEvent(event)}
              >
                <div className="font-medium">{event.title}</div>
                <div className="text-xs flex items-center mt-1">
                  <span className="mr-1">{categoryIcons[event.category] || <FiClipboard />}</span>
                  {event.location || 'Pas de lieu spécifié'}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
      
      {/* Grille horaire */}
      <div className="flex-1 relative">
        {/* Afficher les lignes des heures */}
        {hours.map(hour => (
          <div 
            key={hour} 
            className="h-20 border-b border-gray-700 flex"
            onClick={() => {
              // Créer une date avec l'heure sélectionnée
              const newDate = new Date(currentDate);
              newDate.setHours(hour, 0, 0, 0);
              onAddEvent(newDate);
            }}
          >
            <div className="w-16 p-2 text-right text-gray-400 text-sm border-r border-gray-700">
              {formatHour(hour)}
            </div>
            <div className="flex-1"></div>
          </div>
        ))}
        
        {/* Superposer les événements */}
        <div className="absolute top-0 left-16 right-0 bottom-0 pointer-events-none">
          {timedEvents.map(event => {
            const position = calculateEventPosition(event);
            return (
              <motion.div
                key={event.id}
                className={`absolute left-2 right-2 p-2 rounded-md border pointer-events-auto cursor-pointer
                  ${categoryColors[event.category] || 'bg-gray-600/80 text-gray-100 border-gray-500'} 
                  ${selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-white' : ''}
                  ${position.startsBefore ? 'rounded-t-none border-t-dashed' : ''}
                  ${position.endsAfter ? 'rounded-b-none border-b-dashed' : ''}
                `}
                style={{
                  top: position.top,
                  height: position.height
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelectEvent(event)}
              >
                <div className="text-xs font-medium">
                  {formatEventTime(
                    new Date(event.start_datetime),
                    new Date(event.end_datetime)
                  )}
                </div>
                <div className="font-medium mt-1">{event.title}</div>
                {position.height > 15 && (
                  <>
                    {event.location && (
                      <div className="text-xs mt-2 flex items-center gap-1">
                        <FiCalendar />
                        {event.location}
                      </div>
                    )}
                    <div className="text-xs mt-1 flex items-center">
                      <span className="mr-1">{categoryIcons[event.category] || <FiClipboard />}</span>
                      {event.category === 'meeting' ? 'Réunion' : 
                       event.category === 'call' ? 'Appel' :
                       event.category === 'deadline' ? 'Échéance' :
                       event.category === 'task' ? 'Tâche' :
                       event.category === 'personal' ? 'Personnel' : 'Événement'}
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      
      {/* Message si aucun événement */}
      {sortedEvents.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-4xl mb-3">📅</div>
            <h4 className="text-lg font-medium text-gray-300 mb-2">Pas d'événements</h4>
            <p className="text-sm">
              Aucun événement planifié pour cette journée.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DayView;