/**
 * Service d'export au format iCal (.ics)
 * Conforme à la RFC 5545 (iCalendar)
 * Compatible avec Apple Calendar, Google Calendar, Outlook, etc.
 */

/**
 * Échappe les caractères spéciaux pour le format iCal
 */
function escapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Formate une date au format iCal (YYYYMMDDTHHMMSSZ)
 */
function formatICalDate(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Formate une date au format iCal pour toute la journée (YYYYMMDD)
 */
function formatICalDateOnly(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * Génère la règle RRULE pour un événement récurrent
 */
function generateRRule(event) {
  if (!event.recurrence_type || event.recurrence_type === 'NONE') {
    return null;
  }

  let rrule = `FREQ=${event.recurrence_type}`;

  // Intervalle
  if (event.recurrence_interval && event.recurrence_interval > 1) {
    rrule += `;INTERVAL=${event.recurrence_interval}`;
  }

  // Jours de la semaine (pour WEEKLY)
  if (event.recurrence_type === 'WEEKLY' && event.recurrence_days) {
    const daysMap = {
      0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA'
    };
    const days = event.recurrence_days.map(d => daysMap[d]).join(',');
    if (days) {
      rrule += `;BYDAY=${days}`;
    }
  }

  // Fin de récurrence
  if (event.recurrence_end_type === 'DATE' && event.recurrence_end_date) {
    const untilDate = formatICalDate(event.recurrence_end_date);
    rrule += `;UNTIL=${untilDate}`;
  } else if (event.recurrence_end_type === 'COUNT' && event.recurrence_count) {
    rrule += `;COUNT=${event.recurrence_count}`;
  }

  return rrule;
}

/**
 * Génère un événement VEVENT
 */
function generateVEvent(event, exceptions = [], modifiedOccurrences = []) {
  const lines = [];

  lines.push('BEGIN:VEVENT');

  // UID unique pour l'événement
  const uid = event.uid || `event-${event.id}@crm-perso.local`;
  lines.push(`UID:${uid}`);

  // Date de création et dernière modification
  const now = formatICalDate(new Date());
  lines.push(`DTSTAMP:${now}`);

  if (event.created_at) {
    lines.push(`CREATED:${formatICalDate(event.created_at)}`);
  }

  if (event.updated_at) {
    lines.push(`LAST-MODIFIED:${formatICalDate(event.updated_at)}`);
  }

  // Dates de début et fin
  const isAllDay = event.all_day;

  if (isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatICalDateOnly(event.start_datetime)}`);
    // Pour un événement "all day", la date de fin doit être le jour suivant
    const endDate = new Date(event.end_datetime);
    endDate.setDate(endDate.getDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${formatICalDateOnly(endDate)}`);
  } else {
    lines.push(`DTSTART:${formatICalDate(event.start_datetime)}`);
    lines.push(`DTEND:${formatICalDate(event.end_datetime)}`);
  }

  // Titre et description
  lines.push(`SUMMARY:${escapeICalText(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }

  // Lieu
  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  // Statut
  const statusMap = {
    'confirmed': 'CONFIRMED',
    'tentative': 'TENTATIVE',
    'cancelled': 'CANCELLED'
  };
  const status = statusMap[event.status] || 'CONFIRMED';
  lines.push(`STATUS:${status}`);

  // Récurrence
  const rrule = generateRRule(event);
  if (rrule) {
    lines.push(`RRULE:${rrule}`);
  }

  // Exceptions (dates supprimées)
  if (exceptions.length > 0) {
    const exdates = exceptions
      .map(ex => formatICalDate(ex.exception_date))
      .join(',');
    lines.push(`EXDATE:${exdates}`);
  }

  // Catégories
  if (event.category) {
    lines.push(`CATEGORIES:${escapeICalText(event.category)}`);
  }

  // Priorité
  if (event.priority) {
    // iCal utilise 1-9, où 1 est le plus élevé
    const priorityMap = { high: 1, medium: 5, low: 9 };
    const priority = priorityMap[event.priority] || 5;
    lines.push(`PRIORITY:${priority}`);
  }

  // Rappels/Alarmes
  if (event.reminder_minutes) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICalText(event.title)}`);
    lines.push(`TRIGGER:-PT${event.reminder_minutes}M`);
    lines.push('END:VALARM');
  }

  // URL si disponible
  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  lines.push('END:VEVENT');

  return lines;
}

/**
 * Génère un fichier iCal complet
 */
function generateICalFile(events, calendarName = 'Mon Calendrier CRM') {
  const lines = [];

  // En-tête du calendrier
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//CRM Perso//Calendar Export//FR');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeICalText(calendarName)}`);
  lines.push('X-WR-TIMEZONE:Europe/Paris');

  // Fuseau horaire (optionnel mais recommandé)
  lines.push('BEGIN:VTIMEZONE');
  lines.push('TZID:Europe/Paris');
  lines.push('BEGIN:DAYLIGHT');
  lines.push('TZOFFSETFROM:+0100');
  lines.push('TZOFFSETTO:+0200');
  lines.push('TZNAME:CEST');
  lines.push('DTSTART:19700329T020000');
  lines.push('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
  lines.push('END:DAYLIGHT');
  lines.push('BEGIN:STANDARD');
  lines.push('TZOFFSETFROM:+0200');
  lines.push('TZOFFSETTO:+0100');
  lines.push('TZNAME:CET');
  lines.push('DTSTART:19701025T030000');
  lines.push('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
  lines.push('END:STANDARD');
  lines.push('END:VTIMEZONE');

  // Ajouter chaque événement
  for (const event of events) {
    const eventLines = generateVEvent(
      event,
      event.exceptions || [],
      event.modified_occurrences || []
    );
    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');

  // Limiter les lignes à 75 caractères (RFC 5545)
  const wrappedLines = [];
  for (const line of lines) {
    if (line.length <= 75) {
      wrappedLines.push(line);
    } else {
      // Couper la ligne en morceaux de 75 caractères
      let remaining = line;
      wrappedLines.push(remaining.substring(0, 75));
      remaining = remaining.substring(75);

      while (remaining.length > 0) {
        const chunk = remaining.substring(0, 74); // 74 car on ajoute un espace au début
        wrappedLines.push(` ${chunk}`);
        remaining = remaining.substring(74);
      }
    }
  }

  // Utiliser CRLF comme fin de ligne (RFC 5545)
  return wrappedLines.join('\r\n') + '\r\n';
}

/**
 * Exporte un seul événement
 */
async function exportEvent(db, eventId) {
  try {
    // Récupérer l'événement
    const eventResult = await db.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('Événement non trouvé');
    }

    const event = eventResult.rows[0];

    // Récupérer les exceptions si l'événement est récurrent
    if (event.recurrence_type && event.recurrence_type !== 'NONE') {
      const exceptionsResult = await db.query(
        'SELECT exception_date FROM event_exceptions WHERE event_id = $1',
        [eventId]
      );
      event.exceptions = exceptionsResult.rows;

      const modifiedResult = await db.query(
        'SELECT * FROM events WHERE parent_event_id = $1',
        [eventId]
      );
      event.modified_occurrences = modifiedResult.rows;
    }

    return generateICalFile([event], event.title);
  } catch (error) {
    console.error('Erreur lors de l\'export de l\'événement:', error);
    throw error;
  }
}

/**
 * Exporte tous les événements dans une plage de dates
 */
async function exportCalendar(db, userId, startDate, endDate, calendarName) {
  try {
    let query = 'SELECT * FROM events WHERE user_id = $1';
    const params = [userId];

    // Filtrer par plage de dates si fournie
    if (startDate && endDate) {
      query += ' AND start_datetime >= $2 AND end_datetime <= $3';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY start_datetime ASC';

    const eventsResult = await db.query(query, params);
    const events = eventsResult.rows;

    // Récupérer les exceptions pour chaque événement récurrent
    for (const event of events) {
      if (event.recurrence_type && event.recurrence_type !== 'NONE') {
        const exceptionsResult = await db.query(
          'SELECT exception_date FROM event_exceptions WHERE event_id = $1',
          [event.id]
        );
        event.exceptions = exceptionsResult.rows;
      }
    }

    return generateICalFile(events, calendarName || 'Calendrier CRM');
  } catch (error) {
    console.error('Erreur lors de l\'export du calendrier:', error);
    throw error;
  }
}

/**
 * Exporte les événements d'une catégorie spécifique
 */
async function exportByCategory(db, userId, category, calendarName) {
  try {
    const eventsResult = await db.query(
      'SELECT * FROM events WHERE user_id = $1 AND category = $2 ORDER BY start_datetime ASC',
      [userId, category]
    );

    const events = eventsResult.rows;

    // Récupérer les exceptions pour chaque événement récurrent
    for (const event of events) {
      if (event.recurrence_type && event.recurrence_type !== 'NONE') {
        const exceptionsResult = await db.query(
          'SELECT exception_date FROM event_exceptions WHERE event_id = $1',
          [event.id]
        );
        event.exceptions = exceptionsResult.rows;
      }
    }

    return generateICalFile(events, calendarName || `Calendrier CRM - ${category}`);
  } catch (error) {
    console.error('Erreur lors de l\'export par catégorie:', error);
    throw error;
  }
}

module.exports = {
  exportEvent,
  exportCalendar,
  exportByCategory,
  generateICalFile
};
