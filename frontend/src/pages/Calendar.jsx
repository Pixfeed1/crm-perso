// src/pages/Calendar.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiRefreshCw, FiDownload } from 'react-icons/fi';
import { useCalendarEvents } from '../hooks/useCalendarEvents';

// Composants
import CalendarHeader from '../components/calendar/CalendarHeader';
import MonthView from '../components/calendar/MonthView';
import WeekView from '../components/calendar/WeekView';
import DayView from '../components/calendar/DayView';
import TimelineView from '../components/calendar/TimelineView';
import EventDetails from '../components/calendar/EventDetails';
import EventForm from '../components/calendar/EventForm';
import CalendarSync from '../components/calendar/CalendarSync';
import ICalExport from '../components/calendar/ICalExport';
import Button from '../components/common/Button';

const Calendar = () => {
  const [view, setView] = useState('month'); // 'month', 'week', 'day', 'timeline'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    priority: 'all'
  });

  // Données + mutations centralisées dans le hook (fetch par plage de la vue,
  // filtrage mémoïsé, création/mise à jour/suppression).
  const { filteredEvents, isLoading, saveEvent, updateEvent, deleteEvent } = useCalendarEvents(view, currentDate, filters);

  // Sélection d'un événement
  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
    setIsAddingEvent(false);
  };

  // Sélection d'une date
  const handleSelectDate = (date) => {
    setSelectedDate(date);
    if (view === 'month') {
      setView('day');
    }
  };

  // Navigation dans le calendrier
  const navigateToPrevious = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (view === 'week') {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    } else if (view === 'day') {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 1);
      setCurrentDate(newDate);
      setSelectedDate(newDate);
    } else if (view === 'timeline') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }
  };

  const navigateToNext = () => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (view === 'week') {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    } else if (view === 'day') {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 1);
      setCurrentDate(newDate);
      setSelectedDate(newDate);
    } else if (view === 'timeline') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
  };

  const navigateToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Ajout d'un nouvel événement
  const handleAddEvent = (date = null) => {
    setSelectedEvent(null);
    setIsAddingEvent(true);
    if (date) {
      setSelectedDate(date);
    }
  };

  // Sauvegarde d'un nouvel événement (logique dans le hook) + gestion de la sélection
  const handleSaveEvent = async (eventData) => {
    const newEvent = await saveEvent(eventData);
    if (newEvent) {
      setIsAddingEvent(false);
      setSelectedEvent(newEvent);
    }
  };

  // Mise à jour d'un événement existant
  const handleUpdateEvent = async (id, updatedData) => {
    const updatedEvent = await updateEvent(id, updatedData);
    if (updatedEvent) {
      setSelectedEvent(updatedEvent);
    }
  };

  // Suppression d'un événement
  const handleDeleteEvent = async (id) => {
    const ok = await deleteEvent(id);
    if (ok) {
      setSelectedEvent(null);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
      <div className="max-w-7xl mx-auto w-full">
        <header className="mb-4 sm:mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div>
              <motion.h1
                className="text-2xl sm:text-3xl md:text-4xl font-bold text-text-primary"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                Calendrier
              </motion.h1>
              <motion.p
                className="text-text-muted mt-1 sm:mt-2 text-xs sm:text-sm md:text-base"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                Planifiez vos rendez-vous et suivez vos échéances
              </motion.p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                onClick={() => setIsExportModalOpen(true)}
                variant="secondary"
                icon={FiDownload}
                className="w-full sm:w-auto"
              >
                Exporter
              </Button>
              <Button
                onClick={() => setIsSyncModalOpen(true)}
                variant="primary"
                icon={FiRefreshCw}
                className="w-full sm:w-auto"
              >
                Synchroniser
              </Button>
            </div>
          </div>
        </header>

        <div className="mb-4">
          <CalendarHeader
            view={view}
            setView={setView}
            currentDate={currentDate}
            onPrevious={navigateToPrevious}
            onNext={navigateToNext}
            onToday={navigateToToday}
            onAddEvent={() => handleAddEvent()}
            filters={filters}
            setFilters={setFilters}
          />
        </div>

        <div className="bg-surface/30 backdrop-blur-sm rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 320px)', minHeight: '400px' }}>
        <motion.div
          className="w-full h-full flex flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          key={`view-${view}-${currentDate}`}
        >
          <div className="flex-grow overflow-auto p-2 sm:p-3">
            <AnimatePresence mode="wait">
              {view === 'month' && (
                <MonthView
                  key="month-view"
                  currentDate={currentDate}
                  events={filteredEvents}
                  onSelectDate={handleSelectDate}
                  onSelectEvent={handleSelectEvent}
                  selectedEvent={selectedEvent}
                  onAddEvent={handleAddEvent}
                />
              )}
              {view === 'week' && (
                <WeekView
                  key="week-view"
                  currentDate={currentDate}
                  events={filteredEvents}
                  onSelectDate={handleSelectDate}
                  onSelectEvent={handleSelectEvent}
                  selectedEvent={selectedEvent}
                  onAddEvent={handleAddEvent}
                />
              )}
              {view === 'day' && (
                <DayView
                  key="day-view"
                  currentDate={selectedDate}
                  events={filteredEvents}
                  onSelectEvent={handleSelectEvent}
                  selectedEvent={selectedEvent}
                  onAddEvent={handleAddEvent}
                />
              )}
              {view === 'timeline' && (
                <TimelineView
                  key="timeline-view"
                  currentDate={currentDate}
                  events={filteredEvents}
                  onSelectEvent={handleSelectEvent}
                  selectedEvent={selectedEvent}
                  onAddEvent={handleAddEvent}
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
      </div>

      {/* Modal pour formulaire/détails - Mobile & Desktop (en dehors du conteneur calendrier) */}
      <AnimatePresence>
        {(isAddingEvent || selectedEvent) && (
          <>
            {/* Overlay pour fermer */}
            <motion.div
              className="fixed inset-0 bg-black/60 z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddingEvent(false);
                setSelectedEvent(null);
              }}
            />

            {/* Modal slide-up (mobile) / Modal centré (desktop) */}
            <motion.div
              className="fixed inset-x-0 bottom-0 lg:inset-0 lg:flex lg:items-center lg:justify-center z-[101] overflow-hidden pointer-events-none"
              initial={{ y: "100%", opacity: 0 }}
              animate={{
                y: 0,
                opacity: 1
              }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="bg-surface/98 backdrop-blur-lg rounded-t-2xl lg:rounded-2xl p-4 sm:p-6 h-[85vh] lg:h-auto lg:max-h-[90vh] lg:max-w-3xl lg:w-full overflow-y-auto mx-auto lg:m-4 shadow-2xl border-t lg:border border-border/50 pointer-events-auto">
                <AnimatePresence mode="wait">
                  {isAddingEvent ? (
                    <motion.div
                      key="add-form"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="w-full"
                    >
                      <EventForm
                        selectedDate={selectedDate}
                        onSave={handleSaveEvent}
                        onCancel={() => setIsAddingEvent(false)}
                      />
                    </motion.div>
                  ) : selectedEvent ? (
                    <motion.div
                      key={`event-${selectedEvent.id}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <EventDetails
                        event={selectedEvent}
                        onUpdate={(updatedData) => handleUpdateEvent(selectedEvent.id, updatedData)}
                        onDelete={() => handleDeleteEvent(selectedEvent.id)}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal de synchronisation */}
      <CalendarSync
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />

      {/* Modal d'export iCal */}
      {isExportModalOpen && (
        <ICalExport
          onClose={() => setIsExportModalOpen(false)}
          currentView={view}
        />
      )}
    </div>
  );
};

export default Calendar;