// src/components/calendar/WeekView.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiCalendar, FiMapPin } from 'react-icons/fi';
import { categoryMeta, priorityMeta } from '../../utils/eventStyles';
import { getEventsForDay as eventsForDay } from '../../utils/calendarEvents';

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

      result.push({ date, isToday });
    }

    return result;
  }, [currentDate]);

  // Formatter la date du jour
  const formatDate = (date) => date.getDate();

  // Formatter l'heure
  const formatHour = (hour) => `${hour}:00`;

  // Index des événements par jour (mémoïsé) — utilitaire partagé entre les vues.
  const getEventsForDay = useMemo(() => eventsForDay(events), [events]);

  // Calculer la position et la hauteur d'un événement dans la grille (fenêtre 8h-21h)
  const calculateEventPosition = (event) => {
    const startDateTime = new Date(event.start_datetime);
    const endDateTime = new Date(event.end_datetime);

    const startHour = startDateTime.getHours() + startDateTime.getMinutes() / 60;
    const endHour = endDateTime.getHours() + endDateTime.getMinutes() / 60;

    // Ajuster si l'événement commence avant 8h ou se termine après 20h
    const gridStartHour = Math.max(startHour, 8);
    const gridEndHour = Math.min(endHour, 21);

    // Position top et hauteur en pourcentage de la plage visible (8h-21h = 13h)
    const top = ((gridStartHour - 8) / 13) * 100;
    const height = ((gridEndHour - gridStartHour) / 13) * 100;

    return {
      top: `${top}%`,
      height: `${height}%`,
      startsBefore: startHour < 8,
      endsAfter: endHour > 21
    };
  };

  // Formatter l'heure de l'événement
  const formatEventTime = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Version desktop - visible uniquement sur md et plus */}
      <div className="hidden md:block flex-1">
        <div className="grid grid-cols-8 border-b border-border">
          {/* Cellule vide pour l'angle supérieur gauche */}
          <div className="border-r border-border p-2"></div>

          {/* Jours de la semaine */}
          {daysInWeek.map((day, index) => (
            <div
              key={index}
              className={`p-2 text-center border-r border-border cursor-pointer ${day.isToday ? 'bg-accent/10' : ''}`}
              onClick={() => onSelectDate(day.date)}
            >
              <div className="text-text-muted text-xs">{weekdays[index]}</div>
              <div className={`text-lg font-medium ${day.isToday ? 'text-accent' : 'text-text-primary'}`}>
                {formatDate(day.date)}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-8 relative flex-1">
          {/* Colonne des heures */}
          <div className="border-r border-border">
            {hours.map(hour => (
              <div key={hour} className="h-20 border-b border-border p-2 text-right text-text-muted text-sm">
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {daysInWeek.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className={`border-r border-border relative ${day.isToday ? 'bg-accent/5' : ''}`}
            >
              {/* Lignes des heures (grille) */}
              {hours.map(hour => (
                <div
                  key={hour}
                  className="h-20 border-b border-border"
                  onClick={() => {
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
                  const meta = categoryMeta(event.category);
                  return (
                    <motion.div
                      key={event.id}
                      className={`absolute left-1 right-1 p-1 rounded-md border-l-2
                        ${meta.block}
                        ${priorityMeta(event.priority).borderL}
                        ${selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-accent' : ''}
                        ${position.startsBefore ? 'rounded-t-none border-t-dashed' : ''}
                        ${position.endsAfter ? 'rounded-b-none border-b-dashed' : ''}
                      `}
                      style={{ top: position.top, height: position.height }}
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
                          <meta.Icon /> {event.location || ''}
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
        <div className="p-4 text-center border-b border-border">
          <h3 className="text-lg font-medium text-text-secondary">
            Vue semaine
          </h3>
          <p className="text-sm text-text-muted">Sélectionnez un jour pour voir les détails</p>
        </div>
        <div className="grid grid-cols-7 gap-2 p-4">
          {daysInWeek.map((day, index) => (
            <div
              key={index}
              className={`p-2 text-center rounded-lg cursor-pointer ${day.isToday ? 'bg-accent/20' : 'bg-surface/50'}`}
              onClick={() => onSelectDate(day.date)}
            >
              <div className="text-text-muted text-xs">{weekdays[index]}</div>
              <div className={`text-lg font-medium ${day.isToday ? 'text-accent' : 'text-text-primary'}`}>
                {formatDate(day.date)}
              </div>
              <div className="text-xs text-text-muted mt-1">
                {getEventsForDay(day.date).length} événements
              </div>
            </div>
          ))}
        </div>

        {/* Liste des événements pour aujourd'hui ou le jour sélectionné */}
        <div className="flex-1 p-4">
          <h4 className="text-md font-medium text-text-secondary mb-3">
            Événements ({daysInWeek.find(d => d.isToday) ? 'Aujourd\'hui' : 'Jour sélectionné'})
          </h4>
          <div className="space-y-2">
            {getEventsForDay(daysInWeek.find(d => d.isToday)?.date || daysInWeek[0].date).map(event => {
              const meta = categoryMeta(event.category);
              return (
                <motion.div
                  key={event.id}
                  className={`p-3 rounded-lg cursor-pointer border-l-2 ${meta.block} ${
                    selectedEvent && selectedEvent.id === event.id ? 'ring-2 ring-accent' : ''
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
                    <meta.Icon /> {meta.label}
                  </div>
                </motion.div>
              );
            })}

            {getEventsForDay(daysInWeek.find(d => d.isToday)?.date || daysInWeek[0].date).length === 0 && (
              <div className="text-center text-text-muted py-6">
                <div className="text-3xl mb-2 flex justify-center"><FiCalendar /></div>
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
