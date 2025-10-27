/**
 * Service de détection de conflits d'événements
 * Détecte les chevauchements et suggère des créneaux alternatifs
 */

const eventModel = require('../models/eventModel');

/**
 * Vérifie si deux événements se chevauchent
 */
function eventsOverlap(event1, event2) {
  const start1 = new Date(event1.start_datetime || event1.start_date);
  const end1 = new Date(event1.end_datetime || event1.end_date);
  const start2 = new Date(event2.start_datetime || event2.start_date);
  const end2 = new Date(event2.end_datetime || event2.end_date);

  // Deux événements se chevauchent si :
  // - Le début de l'un est avant la fin de l'autre ET
  // - La fin de l'un est après le début de l'autre
  return start1 < end2 && end1 > start2;
}

/**
 * Détecte les conflits pour un nouvel événement ou une modification
 */
async function detectConflicts(db, eventData, excludeEventId = null) {
  try {
    const { start_datetime, end_datetime, location } = eventData;

    if (!start_datetime || !end_datetime) {
      return { hasConflicts: false, conflicts: [] };
    }

    // Récupérer tous les événements dans la même période
    const startDate = new Date(start_datetime);
    const endDate = new Date(end_datetime);

    // Ajouter une marge de 1 jour pour être sûr de récupérer tous les événements potentiellement en conflit
    const searchStart = new Date(startDate);
    searchStart.setDate(searchStart.getDate() - 1);
    const searchEnd = new Date(endDate);
    searchEnd.setDate(searchEnd.getDate() + 1);

    const existingEvents = await eventModel.getEventsInRange(
      db,
      searchStart.toISOString(),
      searchEnd.toISOString()
    );

    const conflicts = [];

    for (const existingEvent of existingEvents) {
      // Ignorer l'événement lui-même si on modifie
      if (excludeEventId && existingEvent.id === excludeEventId) {
        continue;
      }

      // Vérifier le chevauchement
      if (eventsOverlap(eventData, existingEvent)) {
        // Déterminer le type de conflit
        let conflictType = 'time'; // Chevauchement temporel

        // Si même lieu, c'est un conflit de lieu
        if (location && existingEvent.location &&
            location.toLowerCase() === existingEvent.location.toLowerCase()) {
          conflictType = 'location';
        }

        conflicts.push({
          event: existingEvent,
          type: conflictType,
          overlap: calculateOverlap(eventData, existingEvent)
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts,
      conflictCount: conflicts.length
    };
  } catch (error) {
    console.error('Erreur lors de la détection de conflits:', error);
    throw error;
  }
}

/**
 * Calcule le chevauchement entre deux événements
 */
function calculateOverlap(event1, event2) {
  const start1 = new Date(event1.start_datetime || event1.start_date);
  const end1 = new Date(event1.end_datetime || event1.end_date);
  const start2 = new Date(event2.start_datetime || event2.start_date);
  const end2 = new Date(event2.end_datetime || event2.end_date);

  // Calculer le début et la fin du chevauchement
  const overlapStart = start1 > start2 ? start1 : start2;
  const overlapEnd = end1 < end2 ? end1 : end2;

  // Durée du chevauchement en minutes
  const overlapDuration = (overlapEnd - overlapStart) / (1000 * 60);

  return {
    start: overlapStart.toISOString(),
    end: overlapEnd.toISOString(),
    durationMinutes: Math.round(overlapDuration)
  };
}

/**
 * Suggère des créneaux alternatifs disponibles
 */
async function suggestAlternativeSlots(db, eventData, options = {}) {
  try {
    const {
      numberOfSuggestions = 3,
      searchDays = 7,
      preferredTimeOfDay = null, // 'morning', 'afternoon', 'evening'
      minSlotDuration = 30 // minutes
    } = options;

    const startDate = new Date(eventData.start_datetime);
    const endDate = new Date(eventData.end_datetime);
    const eventDuration = (endDate - startDate) / (1000 * 60); // en minutes

    // Chercher des créneaux dans les prochains jours
    const searchEndDate = new Date(startDate);
    searchEndDate.setDate(searchEndDate.getDate() + searchDays);

    // Récupérer tous les événements dans la période de recherche
    const existingEvents = await eventModel.getEventsInRange(
      db,
      startDate.toISOString(),
      searchEndDate.toISOString()
    );

    const suggestions = [];
    let currentDate = new Date(startDate);

    // Heures de travail par défaut
    const workStartHour = 8;
    const workEndHour = 18;

    // Parcourir chaque jour
    for (let day = 0; day < searchDays && suggestions.length < numberOfSuggestions; day++) {
      // Définir les heures de recherche selon la préférence
      let searchStartHour, searchEndHour;

      if (preferredTimeOfDay === 'morning') {
        searchStartHour = 8;
        searchEndHour = 12;
      } else if (preferredTimeOfDay === 'afternoon') {
        searchStartHour = 14;
        searchEndHour = 18;
      } else if (preferredTimeOfDay === 'evening') {
        searchStartHour = 18;
        searchEndHour = 21;
      } else {
        searchStartHour = workStartHour;
        searchEndHour = workEndHour;
      }

      // Chercher des créneaux disponibles dans la journée
      const daySlots = findAvailableSlotsInDay(
        currentDate,
        eventDuration,
        existingEvents,
        searchStartHour,
        searchEndHour,
        minSlotDuration
      );

      suggestions.push(...daySlots);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Limiter au nombre de suggestions demandé
    return suggestions.slice(0, numberOfSuggestions);
  } catch (error) {
    console.error('Erreur lors de la suggestion de créneaux:', error);
    throw error;
  }
}

/**
 * Trouve les créneaux disponibles dans une journée
 */
function findAvailableSlotsInDay(date, eventDuration, existingEvents, startHour, endHour, minSlotDuration) {
  const slots = [];
  const dayStart = new Date(date);
  dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, 0, 0, 0);

  // Filtrer les événements de ce jour
  const dayEvents = existingEvents.filter(event => {
    const eventStart = new Date(event.start_datetime || event.start_date);
    return eventStart.toDateString() === date.toDateString();
  });

  // Trier les événements par heure de début
  dayEvents.sort((a, b) => {
    const startA = new Date(a.start_datetime || a.start_date);
    const startB = new Date(b.start_datetime || b.start_date);
    return startA - startB;
  });

  let currentSlotStart = new Date(dayStart);

  // Chercher les espaces libres entre les événements
  for (const event of dayEvents) {
    const eventStart = new Date(event.start_datetime || event.start_date);
    const eventEnd = new Date(event.end_datetime || event.end_date);

    // Si il y a un espace avant cet événement
    if (currentSlotStart < eventStart) {
      const availableDuration = (eventStart - currentSlotStart) / (1000 * 60);

      // Si l'espace est assez grand pour notre événement
      if (availableDuration >= eventDuration) {
        slots.push({
          start: new Date(currentSlotStart).toISOString(),
          end: new Date(currentSlotStart.getTime() + eventDuration * 60000).toISOString(),
          duration: eventDuration,
          score: calculateSlotScore(currentSlotStart, eventDuration, startHour, endHour)
        });
      }
    }

    // Mettre à jour le début du prochain créneau
    currentSlotStart = eventEnd > currentSlotStart ? new Date(eventEnd) : currentSlotStart;
  }

  // Vérifier s'il reste un créneau disponible après le dernier événement
  if (currentSlotStart < dayEnd) {
    const availableDuration = (dayEnd - currentSlotStart) / (1000 * 60);

    if (availableDuration >= eventDuration) {
      slots.push({
        start: new Date(currentSlotStart).toISOString(),
        end: new Date(currentSlotStart.getTime() + eventDuration * 60000).toISOString(),
        duration: eventDuration,
        score: calculateSlotScore(currentSlotStart, eventDuration, startHour, endHour)
      });
    }
  }

  // Trier par score (meilleurs créneaux en premier)
  return slots.sort((a, b) => b.score - a.score);
}

/**
 * Calcule un score pour un créneau (0-100)
 * Plus le score est élevé, plus le créneau est optimal
 */
function calculateSlotScore(slotStart, duration, workStartHour, workEndHour) {
  let score = 50; // Score de base

  const hour = slotStart.getHours();
  const minute = slotStart.getMinutes();

  // Préférer les heures pleines (+10)
  if (minute === 0) {
    score += 10;
  } else if (minute === 30) {
    score += 5;
  }

  // Préférer le milieu de la journée de travail (+20 au maximum)
  const workDayCenter = (workStartHour + workEndHour) / 2;
  const distanceFromCenter = Math.abs(hour - workDayCenter);
  score += Math.max(0, 20 - distanceFromCenter * 2);

  // Pénaliser les créneaux tôt le matin ou tard le soir
  if (hour < 9) {
    score -= (9 - hour) * 5;
  }
  if (hour > 17) {
    score -= (hour - 17) * 5;
  }

  // Préférer les créneaux en milieu de semaine
  const dayOfWeek = slotStart.getDay();
  if (dayOfWeek >= 2 && dayOfWeek <= 4) { // Mardi-Jeudi
    score += 10;
  } else if (dayOfWeek === 1 || dayOfWeek === 5) { // Lundi-Vendredi
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Formate un conflit pour l'affichage
 */
function formatConflict(conflict) {
  const { event, type, overlap } = conflict;

  return {
    eventId: event.id,
    eventTitle: event.title,
    eventStart: event.start_datetime,
    eventEnd: event.end_datetime,
    eventLocation: event.location,
    conflictType: type,
    overlapStart: overlap.start,
    overlapEnd: overlap.end,
    overlapDuration: overlap.durationMinutes,
    severity: overlap.durationMinutes > 60 ? 'high' : overlap.durationMinutes > 30 ? 'medium' : 'low'
  };
}

/**
 * Analyse les conflits et retourne un rapport détaillé
 */
async function analyzeConflicts(db, eventData, excludeEventId = null) {
  const conflictResult = await detectConflicts(db, eventData, excludeEventId);

  if (!conflictResult.hasConflicts) {
    return {
      hasConflicts: false,
      conflicts: [],
      summary: 'Aucun conflit détecté',
      suggestions: await suggestAlternativeSlots(db, eventData)
    };
  }

  const formattedConflicts = conflictResult.conflicts.map(formatConflict);

  // Calculer des statistiques
  const totalOverlapMinutes = formattedConflicts.reduce((sum, c) => sum + c.overlapDuration, 0);
  const highSeverityCount = formattedConflicts.filter(c => c.severity === 'high').length;

  let summary = `${conflictResult.conflictCount} conflit(s) détecté(s)`;
  if (highSeverityCount > 0) {
    summary += ` dont ${highSeverityCount} sévère(s)`;
  }

  return {
    hasConflicts: true,
    conflicts: formattedConflicts,
    conflictCount: conflictResult.conflictCount,
    totalOverlapMinutes,
    summary,
    suggestions: await suggestAlternativeSlots(db, eventData, {
      numberOfSuggestions: 5 // Plus de suggestions en cas de conflit
    })
  };
}

module.exports = {
  detectConflicts,
  suggestAlternativeSlots,
  analyzeConflicts,
  eventsOverlap,
  calculateOverlap,
  formatConflict
};
