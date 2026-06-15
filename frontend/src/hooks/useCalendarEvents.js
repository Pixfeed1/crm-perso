// src/hooks/useCalendarEvents.js
//
// Hook unique pour les données du calendrier : chargement par plage de dates de la
// vue courante, filtrage mémoïsé, et mutations (création simple/récurrente, mise à
// jour, suppression). Sort la logique métier de la page Calendar (qui ne garde que
// l'état d'UI : vue, date courante, sélection, modales).
import { useState, useEffect, useMemo, useCallback } from 'react';
import { eventsAPI } from '../services/api';
import { useToast } from './useToast';

const isValidDate = (date) => date instanceof Date && !isNaN(date.getTime());

// Plage [start, end] à charger selon la vue (inclut les occurrences récurrentes).
const rangeForView = (view, currentDate) => {
  let startDate, endDate;
  if (view === 'month' || view === 'timeline') {
    startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
  } else if (view === 'week') {
    const currentDay = currentDate.getDay();
    startDate = new Date(currentDate);
    startDate.setDate(currentDate.getDate() - currentDay);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59);
  } else {
    startDate = new Date(currentDate);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(currentDate);
    endDate.setHours(23, 59, 59);
  }
  return { startDate, endDate };
};

export function useCalendarEvents(view, currentDate, filters) {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = rangeForView(view, currentDate);
      const eventsData = await eventsAPI.getAll({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString()
      });
      setEvents(Array.isArray(eventsData) ? eventsData : []);
    } catch (error) {
      console.error('Erreur lors du chargement des événements:', error);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [view, currentDate]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Filtrage mémoïsé (évite un recalcul + un setState à chaque rendu).
  const filteredEvents = useMemo(() => {
    const q = (filters.search || '').toLowerCase();
    return events.filter((event) => {
      const searchMatch =
        !q ||
        (event.title && event.title.toLowerCase().includes(q)) ||
        (event.description && event.description.toLowerCase().includes(q));
      const categoryMatch = filters.category === 'all' || event.category === filters.category;
      const priorityMatch = filters.priority === 'all' || event.priority === filters.priority;
      return searchMatch && categoryMatch && priorityMatch;
    });
  }, [events, filters]);

  // Création (simple ou récurrente). Renvoie l'événement créé, ou null en cas d'erreur.
  const saveEvent = useCallback(async (eventData) => {
    try {
      const startDate = eventData.start_date instanceof Date ? eventData.start_date : new Date(eventData.start_date);
      const endDate = eventData.end_date instanceof Date ? eventData.end_date : new Date(eventData.end_date);
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        toast.error('Erreur: Les dates saisies sont invalides.');
        return null;
      }

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

      const isRecurring = eventData.recurrence_type && eventData.recurrence_type !== 'NONE';
      if (isRecurring) {
        eventToSave.recurrence_type = eventData.recurrence_type;
        eventToSave.recurrence_interval = eventData.recurrence_interval || 1;
        eventToSave.recurrence_days = eventData.recurrence_days || null;
        eventToSave.recurrence_end_type = eventData.recurrence_end_type || 'NEVER';
        if (eventData.recurrence_end_type === 'DATE' && eventData.recurrence_end_date) {
          const endRecurrenceDate = eventData.recurrence_end_date instanceof Date
            ? eventData.recurrence_end_date
            : new Date(eventData.recurrence_end_date);
          eventToSave.recurrence_end_date = endRecurrenceDate.toISOString();
        }
        if (eventData.recurrence_end_type === 'COUNT') {
          eventToSave.recurrence_count = eventData.recurrence_count || 10;
        }
      }

      const newEvent = isRecurring
        ? await eventsAPI.createRecurring(eventToSave)
        : await eventsAPI.create(eventToSave);

      setEvents(prev => [...prev, newEvent]);
      toast.success(isRecurring ? 'Événement récurrent créé avec succès !' : 'Événement créé avec succès !');
      return newEvent;
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'événement:", error);
      toast.error("Une erreur est survenue lors de la création de l'événement.");
      return null;
    }
  }, [toast]);

  // Mise à jour. Renvoie l'événement mis à jour, ou null en cas d'erreur.
  const updateEvent = useCallback(async (id, updatedData) => {
    try {
      const formattedData = { ...updatedData };

      if (updatedData.start_date) {
        const startDate = updatedData.start_date instanceof Date ? updatedData.start_date : new Date(updatedData.start_date);
        if (!isValidDate(startDate)) {
          toast.error('Erreur: La date de début est invalide.');
          return null;
        }
        formattedData.start_datetime = startDate.toISOString();
      }
      if (updatedData.end_date) {
        const endDate = updatedData.end_date instanceof Date ? updatedData.end_date : new Date(updatedData.end_date);
        if (!isValidDate(endDate)) {
          toast.error('Erreur: La date de fin est invalide.');
          return null;
        }
        formattedData.end_datetime = endDate.toISOString();
      }

      const updatedEvent = await eventsAPI.update(id, formattedData);
      setEvents(prev => prev.map(event => (event.id === id ? { ...event, ...updatedEvent } : event)));
      return updatedEvent;
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'événement:", error);
      toast.error("Une erreur est survenue lors de la mise à jour de l'événement.");
      return null;
    }
  }, [toast]);

  // Suppression. Renvoie true si succès.
  const deleteEvent = useCallback(async (id) => {
    try {
      await eventsAPI.delete(id);
      setEvents(prev => prev.filter(event => event.id !== id));
      return true;
    } catch (error) {
      console.error("Erreur lors de la suppression de l'événement:", error);
      toast.error("Une erreur est survenue lors de la suppression de l'événement.");
      return false;
    }
  }, [toast]);

  return { events, filteredEvents, isLoading, saveEvent, updateEvent, deleteEvent, refetch: fetchEvents };
}
