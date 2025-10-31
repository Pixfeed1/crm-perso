/**
 * Service de gestion des récurrences d'événements
 * Génère les occurrences récurrentes selon les règles RFC 5545 (iCalendar)
 */

/**
 * Génère les occurrences d'un événement récurrent entre deux dates
 * 
 * @param {Object} event - L'événement récurrent
 * @param {Date} startRange - Date de début de la plage
 * @param {Date} endRange - Date de fin de la plage
 * @param {Array} exceptions - Liste des dates d'exception (occurrences supprimées)
 * @returns {Array} Liste des occurrences
 */
function generateOccurrences(event, startRange, endRange, exceptions = []) {
  // Si pas de récurrence, retourner l'événement tel quel s'il est dans la plage
  if (!event.recurrence_type || event.recurrence_type === 'NONE') {
    const eventStart = new Date(event.start_date);
    const eventEnd = new Date(event.end_date);
    
    if (eventStart <= endRange && eventEnd >= startRange) {
      return [event];
    }
    return [];
  }

  const occurrences = [];
  const eventStart = new Date(event.start_date);
  const eventEnd = new Date(event.end_date);
  const duration = eventEnd - eventStart; // Durée de l'événement en ms

  let currentDate = new Date(eventStart);
  let count = 0;
  const maxOccurrences = event.recurrence_count || 365; // Limite de sécurité

  // Convertir les exceptions en timestamps pour comparaison rapide
  const exceptionTimestamps = exceptions.map(d => new Date(d).getTime());

  while (count < maxOccurrences) {
    // Vérifier si on dépasse la date de fin de récurrence
    if (event.recurrence_end_type === 'DATE' && event.recurrence_end_date) {
      if (currentDate > new Date(event.recurrence_end_date)) {
        break;
      }
    }

    // Vérifier si on dépasse le nombre d'occurrences
    if (event.recurrence_end_type === 'COUNT' && event.recurrence_count) {
      if (count >= event.recurrence_count) {
        break;
      }
    }

    // Vérifier si on est dans la plage demandée
    const occurrenceEnd = new Date(currentDate.getTime() + duration);
    
    if (currentDate <= endRange && occurrenceEnd >= startRange) {
      // Vérifier si cette occurrence n'est pas dans les exceptions
      if (!exceptionTimestamps.includes(currentDate.getTime())) {
        occurrences.push({
          ...event,
          start_date: new Date(currentDate),
          end_date: new Date(currentDate.getTime() + duration),
          is_recurring_instance: true,
          original_start: event.start_date
        });
      }
    }

    // Si on dépasse la plage demandée, arrêter
    if (currentDate > endRange) {
      break;
    }

    // Calculer la prochaine occurrence
    currentDate = getNextOccurrence(currentDate, event);
    count++;

    // Sécurité : si on ne progresse pas, arrêter
    if (!currentDate) {
      break;
    }
  }

  return occurrences;
}

/**
 * Calcule la prochaine occurrence selon le type de récurrence
 */
function getNextOccurrence(currentDate, event) {
  const interval = event.recurrence_interval || 1;
  let nextDate = new Date(currentDate);

  switch (event.recurrence_type) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + interval);
      break;

    case 'WEEKLY':
      // Si recurrence_days est défini, utiliser les jours spécifiques
      if (event.recurrence_days) {
        const days = event.recurrence_days.split(',').map(d => parseInt(d)).sort((a, b) => a - b);
        const currentDay = nextDate.getDay();
        
        // Trouver le prochain jour dans la liste
        let foundNext = false;
        for (const day of days) {
          if (day > currentDay) {
            const daysToAdd = day - currentDay;
            nextDate.setDate(nextDate.getDate() + daysToAdd);
            foundNext = true;
            break;
          }
        }
        
        // Si aucun jour suivant dans la semaine actuelle, passer à la semaine suivante
        if (!foundNext) {
          const daysToAdd = (7 - currentDay) + days[0] + (7 * (interval - 1));
          nextDate.setDate(nextDate.getDate() + daysToAdd);
        }
      } else {
        // Sinon, même jour chaque semaine
        nextDate.setDate(nextDate.getDate() + (7 * interval));
      }
      break;

    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;

    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;

    default:
      return null;
  }

  return nextDate;
}

/**
 * Génère une RRULE au format iCalendar pour compatibilité externe
 */
function generateRRule(event) {
  if (!event.recurrence_type || event.recurrence_type === 'NONE') {
    return null;
  }

  let rrule = `FREQ=${event.recurrence_type}`;

  if (event.recurrence_interval && event.recurrence_interval > 1) {
    rrule += `;INTERVAL=${event.recurrence_interval}`;
  }

  if (event.recurrence_type === 'WEEKLY' && event.recurrence_days) {
    const dayMap = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
    const days = event.recurrence_days.split(',').map(d => dayMap[parseInt(d)]).join(',');
    rrule += `;BYDAY=${days}`;
  }

  if (event.recurrence_end_type === 'COUNT' && event.recurrence_count) {
    rrule += `;COUNT=${event.recurrence_count}`;
  } else if (event.recurrence_end_type === 'DATE' && event.recurrence_end_date) {
    const endDate = new Date(event.recurrence_end_date);
    const formatted = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    rrule += `;UNTIL=${formatted}`;
  }

  return rrule;
}

/**
 * Valide les données de récurrence
 */
function validateRecurrence(recurrenceData) {
  const errors = [];

  if (recurrenceData.recurrence_type && recurrenceData.recurrence_type !== 'NONE') {
    // Vérifier l'intervalle
    if (!recurrenceData.recurrence_interval || recurrenceData.recurrence_interval < 1) {
      errors.push('L\'intervalle de récurrence doit être supérieur ou égal à 1');
    }

    // Vérifier les jours pour récurrence hebdomadaire
    if (recurrenceData.recurrence_type === 'WEEKLY' && recurrenceData.recurrence_days) {
      const days = recurrenceData.recurrence_days.split(',').map(d => parseInt(d));
      if (days.some(d => d < 0 || d > 6)) {
        errors.push('Les jours de la semaine doivent être entre 0 (dimanche) et 6 (samedi)');
      }
    }

    // Vérifier la fin de récurrence
    if (recurrenceData.recurrence_end_type === 'COUNT' && (!recurrenceData.recurrence_count || recurrenceData.recurrence_count < 1)) {
      errors.push('Le nombre d\'occurrences doit être supérieur ou égal à 1');
    }

    if (recurrenceData.recurrence_end_type === 'DATE') {
      if (!recurrenceData.recurrence_end_date) {
        errors.push('La date de fin de récurrence est requise');
      } else {
        const endDate = new Date(recurrenceData.recurrence_end_date);
        const startDate = new Date(recurrenceData.start_date);
        if (endDate <= startDate) {
          errors.push('La date de fin de récurrence doit être après la date de début');
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  generateOccurrences,
  generateRRule,
  validateRecurrence,
  getNextOccurrence
};
