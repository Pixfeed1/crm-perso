import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut, FiMaximize2 } from 'react-icons/fi';

const TimelineView = ({
  currentDate,
  events,
  onSelectEvent,
  selectedEvent,
  onAddEvent
}) => {
  const [dependencies, setDependencies] = useState([]);
  const [zoom, setZoom] = useState(1); // 1 = jour, 2 = semaine, 3 = mois
  const [visibleDateRange, setVisibleDateRange] = useState({ start: null, end: null });
  const [swimlanes, setSwimlanes] = useState([]);
  const timelineRef = useRef(null);

  // Calculer la plage de dates visible
  useEffect(() => {
    const start = new Date(currentDate);
    start.setDate(1); // Premier jour du mois

    const end = new Date(currentDate);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // Dernier jour du mois

    setVisibleDateRange({ start, end });
  }, [currentDate]);

  // Charger les dépendances
  useEffect(() => {
    if (events.length > 0) {
      loadDependencies();
    }
  }, [events]);

  // Organiser les événements par swimlane
  useEffect(() => {
    if (!events || !Array.isArray(events)) {
      setSwimlanes([]);
      return;
    }

    const lanes = new Map();

    events.forEach(event => {
      const lane = event.swimlane || 'Défaut';
      if (!lanes.has(lane)) {
        lanes.set(lane, []);
      }
      lanes.get(lane).push(event);
    });

    const swimlaneArray = Array.from(lanes.entries()).map(([name, evts]) => ({
      name,
      events: evts.sort((a, b) => {
        const dateA = a.start_datetime ? new Date(a.start_datetime) : new Date(0);
        const dateB = b.start_datetime ? new Date(b.start_datetime) : new Date(0);
        return dateA - dateB;
      })
    }));

    setSwimlanes(swimlaneArray);
  }, [events]);

  const loadDependencies = async () => {
    try {
      if (!events || !Array.isArray(events) || events.length === 0) {
        setDependencies([]);
        return;
      }

      const eventIds = events.map(e => e.id).join(',');
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/events/dependencies?event_ids=${eventIds}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDependencies(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des dépendances:', error);
    }
  };

  // Calculer la position X d'une date
  const getDatePosition = (date) => {
    if (!visibleDateRange.start || !visibleDateRange.end) return 0;

    const totalDays = Math.ceil(
      (visibleDateRange.end - visibleDateRange.start) / (1000 * 60 * 60 * 24)
    );

    const daysPassed = Math.ceil(
      (new Date(date) - visibleDateRange.start) / (1000 * 60 * 60 * 24)
    );

    const containerWidth = timelineRef.current?.offsetWidth - 200 || 800; // -200 pour la colonne des noms
    return (daysPassed / totalDays) * containerWidth;
  };

  // Calculer la largeur d'un événement
  const getEventWidth = (startDate, endDate) => {
    const startPos = getDatePosition(startDate);
    const endPos = getDatePosition(endDate);
    return Math.max(endPos - startPos, 20); // Min 20px
  };

  // Générer les colonnes de dates
  const generateDateColumns = () => {
    if (!visibleDateRange.start || !visibleDateRange.end) return [];

    const columns = [];
    const current = new Date(visibleDateRange.start);

    while (current <= visibleDateRange.end) {
      columns.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return columns;
  };

  // Dessiner une ligne de dépendance
  const renderDependencyLine = (dependency) => {
    const sourceEvent = events.find(e => e.id === dependency.source_event_id);
    const targetEvent = events.find(e => e.id === dependency.target_event_id);

    if (!sourceEvent || !targetEvent) return null;

    // Simplification : ligne droite entre fin de source et début de target
    const sourceX = getDatePosition(sourceEvent.end_datetime) + 200;
    const targetX = getDatePosition(targetEvent.start_datetime) + 200;

    // Trouver les positions Y (approximation)
    const sourceY = swimlanes.findIndex(sl =>
      sl.events.some(e => e.id === sourceEvent.id)
    ) * 60 + 30;

    const targetY = swimlanes.findIndex(sl =>
      sl.events.some(e => e.id === targetEvent.id)
    ) * 60 + 30;

    return (
      <line
        key={dependency.id}
        x1={sourceX}
        y1={sourceY}
        x2={targetX}
        y2={targetY}
        stroke="#3B82F6"
        strokeWidth="2"
        markerEnd="url(#arrowhead)"
        opacity="0.6"
      />
    );
  };

  const dateColumns = generateDateColumns();

  // Libellé court d'une plage de dates (vue liste mobile)
  const formatRange = (start, end) => {
    const opts = { day: '2-digit', month: 'short' };
    const sd = start ? new Date(start) : null;
    const ed = end ? new Date(end) : null;
    if (sd && !isNaN(sd) && ed && !isNaN(ed)) {
      return `${sd.toLocaleDateString('fr-FR', opts)} → ${ed.toLocaleDateString('fr-FR', opts)}`;
    }
    if (sd && !isNaN(sd)) return sd.toLocaleDateString('fr-FR', opts);
    return '';
  };

  return (
    <div className="h-full flex flex-col bg-surface-muted" ref={timelineRef}>
      {/* Header avec contrôles */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 bg-surface border-b border-border">
        <div className="hidden md:flex items-center space-x-2">
          <button
            className="p-2 hover:bg-surface-strong rounded"
            onClick={() => setZoom(Math.max(1, zoom - 1))}
          >
            <FiZoomOut className="text-text-primary" />
          </button>
          <span className="text-text-primary text-sm">
            {zoom === 1 ? 'Jour' : zoom === 2 ? 'Semaine' : 'Mois'}
          </span>
          <button
            className="p-2 hover:bg-surface-strong rounded"
            onClick={() => setZoom(Math.min(3, zoom + 1))}
          >
            <FiZoomIn className="text-text-primary" />
          </button>
        </div>

        <div className="flex items-center space-x-4">
          <button
            className="p-2 hover:bg-surface-strong rounded"
            onClick={() => {
              const newDate = new Date(currentDate);
              newDate.setMonth(newDate.getMonth() - 1);
              // Appeler onPrevious si disponible via props
            }}
          >
            <FiChevronLeft className="text-text-primary" />
          </button>
          <span className="text-text-primary font-medium">
            {currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </span>
          <button
            className="p-2 hover:bg-surface-strong rounded"
            onClick={() => {
              const newDate = new Date(currentDate);
              newDate.setMonth(newDate.getMonth() + 1);
              // Appeler onNext si disponible via props
            }}
          >
            <FiChevronRight className="text-text-primary" />
          </button>
        </div>

        <button className="hidden md:block p-2 hover:bg-surface-strong rounded">
          <FiMaximize2 className="text-text-primary" />
        </button>
      </div>

      {/* Grille Timeline (Gantt) — desktop uniquement */}
      <div className="hidden md:block flex-1 overflow-auto relative">
        {/* En-tête des dates */}
        <div className="sticky top-0 z-10 flex bg-surface border-b border-border">
          <div className="w-48 flex-shrink-0 p-2 border-r border-border">
            <span className="text-text-primary font-medium">Tâches</span>
          </div>
          <div className="flex-1 flex">
            {dateColumns.map((date, index) => (
              <div
                key={index}
                className="flex-1 min-w-[40px] p-2 border-r border-border text-center"
              >
                <div className="text-text-primary text-xs">
                  {date.getDate()}
                </div>
                <div className="text-text-muted text-xs">
                  {date.toLocaleDateString('fr-FR', { weekday: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lignes des swimlanes */}
        <div className="relative">
          {swimlanes.map((swimlane, laneIndex) => (
            <div
              key={laneIndex}
              className="flex border-b border-border"
              style={{ minHeight: '60px' }}
            >
              {/* Nom du swimlane */}
              <div className="w-48 flex-shrink-0 p-3 border-r border-border bg-surface/50">
                <span className="text-text-primary text-sm font-medium">{swimlane.name}</span>
                <div className="text-text-muted text-xs mt-1">
                  {swimlane.events.length} tâche{swimlane.events.length > 1 ? 's' : ''}
                </div>
              </div>

              {/* Grille de fond */}
              <div className="flex-1 flex">
                {dateColumns.map((date, index) => (
                  <div
                    key={index}
                    className="flex-1 min-w-[40px] border-r border-border/30"
                  />
                ))}
              </div>

              {/* Barres d'événements */}
              <div className="absolute left-48 right-0 top-0 h-full pointer-events-none">
                {swimlane.events.map((event) => {
                  const startPos = getDatePosition(event.start_datetime);
                  const width = getEventWidth(event.start_datetime, event.end_datetime);
                  const isSelected = selectedEvent?.id === event.id;

                  return (
                    <motion.div
                      key={event.id}
                      className={`absolute top-2 rounded pointer-events-auto cursor-pointer ${
                        isSelected ? 'ring-2 ring-white' : ''
                      }`}
                      style={{
                        left: `${startPos}px`,
                        width: `${width}px`,
                        height: '40px',
                        backgroundColor: event.timeline_color || event.color || '#3B82F6'
                      }}
                      onClick={() => onSelectEvent(event)}
                      whileHover={{ scale: 1.02, y: -2 }}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <div className="p-2 h-full flex flex-col justify-between">
                        <div className="text-text-primary text-xs font-medium truncate">
                          {event.title}
                        </div>
                        {event.completion_percentage > 0 && (
                          <div className="w-full bg-surface-strong/50 rounded-full h-1">
                            <div
                              className="bg-success-text h-1 rounded-full"
                              style={{ width: `${event.completion_percentage}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Icône jalon */}
                      {event.is_milestone && (
                        <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-warning-text rotate-45" />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* SVG pour les liens de dépendances */}
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1 }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#3B82F6"
                />
              </marker>
            </defs>
            {dependencies.map(dep => renderDependencyLine(dep))}
          </svg>
        </div>
      </div>

      {/* Vue liste empilée — mobile uniquement (le Gantt n'est pas exploitable < md) */}
      <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-4">
        {swimlanes.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-8">Aucune tâche à afficher.</p>
        ) : (
          swimlanes.map((swimlane, laneIndex) => (
            <div key={laneIndex}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-primary text-sm font-semibold">{swimlane.name}</span>
                <span className="text-text-muted text-xs">
                  {swimlane.events.length} tâche{swimlane.events.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {swimlane.events.map((event) => {
                  const isSelected = selectedEvent?.id === event.id;
                  return (
                    <motion.button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`w-full text-left bg-surface border rounded-xl p-3 transition-colors ${
                        isSelected ? 'border-accent' : 'border-border hover:border-border-strong'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: event.timeline_color || event.color || 'rgb(var(--accent))' }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-text-primary text-sm font-medium break-words">{event.title}</span>
                            {event.is_milestone && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warning-bg text-warning-text">Jalon</span>
                            )}
                          </div>
                          {formatRange(event.start_datetime, event.end_datetime) && (
                            <div className="text-text-muted text-xs mt-0.5">
                              {formatRange(event.start_datetime, event.end_datetime)}
                            </div>
                          )}
                          {event.completion_percentage > 0 && (
                            <div className="w-full bg-surface-strong/50 rounded-full h-1 mt-2">
                              <div
                                className="bg-success-text h-1 rounded-full"
                                style={{ width: `${Math.min(100, event.completion_percentage)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Légende — desktop uniquement (spécifique au Gantt) */}
      <div className="hidden md:flex p-3 bg-surface border-t border-border items-center justify-between text-xs text-text-muted">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-accent rounded" />
            <span>Tâche</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-warning-text rotate-45" />
            <span>Jalon</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg width="20" height="10">
              <line x1="0" y1="5" x2="15" y2="5" stroke="#3B82F6" strokeWidth="2" />
              <polygon points="15,2 20,5 15,8" fill="#3B82F6" />
            </svg>
            <span>Dépendance</span>
          </div>
        </div>

        <div className="text-text-muted">
          {events.length} événement{events.length > 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
};

export default TimelineView;
