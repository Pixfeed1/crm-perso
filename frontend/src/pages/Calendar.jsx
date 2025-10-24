// src/pages/Calendar.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Remplacer executeQuery par la fonction d'API
import { eventsAPI } from '../services/api';

// Composants
import CalendarHeader from '../components/calendar/CalendarHeader';
import MonthView from '../components/calendar/MonthView';
import WeekView from '../components/calendar/WeekView';
import DayView from '../components/calendar/DayView';
import EventDetails from '../components/calendar/EventDetails';
import EventForm from '../components/calendar/EventForm';
import EmptyState from '../components/common/EmptyState';

const Calendar = () => {
  const [view, setView] = useState('month'); // 'month', 'week', 'day'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    priority: 'all'
  });

  // Récupération des événements depuis l'API
  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        // Récupérer les événements via l'API
        const eventsData = await eventsAPI.getAll();
        console.log('Événements chargés via API:', eventsData);
        
        setEvents(eventsData);
        setFilteredEvents(eventsData);
      } catch (error) {
        console.error('Erreur lors du chargement des événements:', error);
        // En cas d'erreur, définir un tableau vide
        setEvents([]);
        setFilteredEvents([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEvents();
  }, []);

  // Filtrage des événements en fonction des critères
  useEffect(() => {
    const result = events.filter(event => {
      const searchMatch =
        filters.search === '' ||
        event.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        (event.description &&
          event.description.toLowerCase().includes(filters.search.toLowerCase()));
      const categoryMatch = filters.category === 'all' || event.category === filters.category;
      const priorityMatch = filters.priority === 'all' || event.priority === filters.priority;
      return searchMatch && categoryMatch && priorityMatch;
    });
    setFilteredEvents(result);
  }, [events, filters]);

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

  // Vérification de la validité d'une date
  const isValidDate = (date) => {
    return date instanceof Date && !isNaN(date.getTime());
  };

  // Sauvegarde d'un nouvel événement via l'API
  const handleSaveEvent = async (eventData) => {
    try {
      // Validation des dates
      const startDate = eventData.start_date instanceof Date ? eventData.start_date : new Date(eventData.start_date);
      const endDate = eventData.end_date instanceof Date ? eventData.end_date : new Date(eventData.end_date);
      
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        console.error("Dates invalides:", eventData.start_date, eventData.end_date);
        alert("Erreur: Les dates saisies sont invalides.");
        return;
      }
      
      // Préparation des données pour l'insertion
      const eventToSave = {
        title: eventData.title,
        description: eventData.description,
        start_datetime: startDate.toISOString(),
        end_datetime: endDate.toISOString(),
        all_day: eventData.all_day || false,
        location: eventData.location || '',
        category: eventData.category || 'meeting',
        priority: eventData.priority || 'medium',
        color: eventData.color || '#3B82F6'
      };
      
      // Utiliser l'API pour créer l'événement
      const newEvent = await eventsAPI.create(eventToSave);
      console.log('Événement créé via API:', newEvent);
      
      // Mettre à jour l'état
      setEvents(prevEvents => [...prevEvents, newEvent]);
      setIsAddingEvent(false);
      setSelectedEvent(newEvent);
      
      console.log("Événement créé avec succès:", newEvent);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'événement:", error);
      alert("Une erreur est survenue lors de la création de l'événement.");
    }
  };

  // Mise à jour d'un événement existant via l'API
  const handleUpdateEvent = async (id, updatedData) => {
    try {
      console.log('Mise à jour de l\'événement ID:', id, 'avec données:', updatedData);
      
      // Préparer les données
      const formattedData = {...updatedData};
      
      // Mise à jour des dates si nécessaire
      if (updatedData.start_date) {
        const startDate = updatedData.start_date instanceof Date 
          ? updatedData.start_date 
          : new Date(updatedData.start_date);
          
        if (isValidDate(startDate)) {
          formattedData.start_datetime = startDate.toISOString();
        } else {
          console.error("Date de début invalide:", updatedData.start_date);
          alert("Erreur: La date de début est invalide.");
          return;
        }
      }
      
      if (updatedData.end_date) {
        const endDate = updatedData.end_date instanceof Date 
          ? updatedData.end_date 
          : new Date(updatedData.end_date);
          
        if (isValidDate(endDate)) {
          formattedData.end_datetime = endDate.toISOString();
        } else {
          console.error("Date de fin invalide:", updatedData.end_date);
          alert("Erreur: La date de fin est invalide.");
          return;
        }
      }
      
      // Utiliser l'API pour mettre à jour l'événement
      const updatedEvent = await eventsAPI.update(id, formattedData);
      console.log('Événement mis à jour via API:', updatedEvent);
      
      // Mettre à jour l'état local
      const updatedEvents = events.map(event =>
        event.id === id ? { ...event, ...updatedEvent } : event
      );
      
      setEvents(updatedEvents);
      setSelectedEvent(updatedEvent);
      
      console.log("Événement mis à jour avec succès:", updatedEvent);
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'événement:", error);
      alert("Une erreur est survenue lors de la mise à jour de l'événement.");
    }
  };

  // Suppression d'un événement via l'API
  const handleDeleteEvent = async (id) => {
    try {
      console.log("Suppression de l'événement ID:", id);
      
      // Utiliser l'API pour supprimer l'événement
      await eventsAPI.delete(id);
      console.log('Événement supprimé via API');
      
      // Mettre à jour l'état local
      const remainingEvents = events.filter(event => event.id !== id);
      setEvents(remainingEvents);
      setSelectedEvent(null);
      
      console.log("Événement supprimé avec succès, ID:", id);
    } catch (error) {
      console.error("Erreur lors de la suppression de l'événement:", error);
      alert("Une erreur est survenue lors de la suppression de l'événement.");
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="mb-4 flex-shrink-0">
        <motion.h1
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-indigo-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Calendrier
        </motion.h1>
        <motion.p
          className="text-indigo-200 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Planifiez vos rendez-vous et suivez vos échéances
        </motion.p>
      </header>

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
        className="flex-shrink-0"
      />

      <div className="flex flex-col md:flex-row flex-grow bg-gray-800/30 backdrop-blur-sm rounded-2xl overflow-hidden">
        <motion.div
          className="w-full md:w-2/3 flex flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          key={`view-${view}-${currentDate}`}
        >
          <div className="flex-grow overflow-auto">
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
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div
          className="w-full md:w-1/3 md:pl-4 mt-4 md:mt-0 overflow-hidden"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-2xl p-4 h-full overflow-auto">
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
              ) : (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex items-center justify-center"
                >
                  <EmptyState
                    icon="📅"
                    title={view === 'day' ? 'Sélectionnez un événement' : 'Calendrier'}
                    description={
                      view === 'day'
                        ? "Sélectionnez un événement ou créez-en un nouveau."
                        : "Cliquez sur une date pour voir les détails ou ajouter un événement."
                    }
                    action={
                      <motion.button
                        className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleAddEvent()}
                      >
                        <span className="mr-2">+</span>
                        Nouvel événement
                      </motion.button>
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Calendar;