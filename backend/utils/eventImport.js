// backend/utils/eventImport.js
//
// Normalisation d'un événement importé via JSON (création en masse depuis le calendrier).
// Tolérant : applique des valeurs par défaut, calcule la fin si absente, mappe un bloc
// "repeat" simple vers les champs de récurrence existants (recurrence_*). Ne touche pas
// à la base : renvoie un objet prêt pour eventModel.createEvent / createRecurringEvent.

const FREQ_MAP = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
const DAY_MAP = { SU: 0, SUN: 0, MO: 1, MON: 1, TU: 2, TUE: 2, WE: 3, WED: 3, TH: 4, THU: 4, FR: 5, FRI: 5, SA: 6, SAT: 6 };

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

// Mappe le bloc repeat -> champs de récurrence. Renvoie { fields, warnings } ou { error }.
function mapRepeat(repeat, startISO) {
  if (!repeat || typeof repeat !== 'object') return { fields: null, warnings: [] };
  const warnings = [];
  const freq = FREQ_MAP[String(repeat.freq || '').toLowerCase()];
  if (!freq) return { error: `repeat.freq invalide (attendu: daily|weekly|monthly|yearly)` };

  const fields = {
    recurrence_type: freq,
    recurrence_interval: Number(repeat.interval) > 0 ? Number(repeat.interval) : 1
  };

  if (freq === 'WEEKLY' && Array.isArray(repeat.days) && repeat.days.length) {
    const nums = repeat.days.map((d) => DAY_MAP[String(d).toUpperCase()]).filter((n) => n !== undefined);
    if (nums.length) fields.recurrence_days = nums.join(',');
    else warnings.push('repeat.days non reconnu (ex: ["MO","WE","FR"]) : ignoré');
  }

  if (repeat.count !== undefined && repeat.count !== null) {
    fields.recurrence_end_type = 'COUNT';
    fields.recurrence_count = Number(repeat.count) > 0 ? Number(repeat.count) : 1;
  } else if (repeat.until) {
    const until = new Date(repeat.until);
    if (!isValidDate(until)) return { error: 'repeat.until : date invalide' };
    if (until <= new Date(startISO)) return { error: 'repeat.until doit être après la date de début' };
    fields.recurrence_end_type = 'DATE';
    fields.recurrence_end_date = until.toISOString();
  } else {
    fields.recurrence_end_type = 'NEVER';
    warnings.push('Série sans fin (ni count ni until) : limitée à la plage affichée');
  }

  return { fields, warnings };
}

// Normalise une entrée brute. Renvoie { event, isRecurring, warnings } ou { error }.
function normalizeImportEvent(raw, defaults = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Entrée non-objet' };
  const warnings = [];

  const title = (raw.title || '').toString().trim();
  if (!title) return { error: 'title manquant' };
  if (!raw.start) return { error: 'start manquant' };

  const allDay = raw.all_day === true;
  const start = new Date(raw.start);
  if (!isValidDate(start)) return { error: `start invalide : "${raw.start}"` };

  // Fin : end explicite, sinon duration_minutes, sinon +60 min (ou = start si all_day)
  let end;
  if (raw.end) {
    end = new Date(raw.end);
    if (!isValidDate(end)) return { error: `end invalide : "${raw.end}"` };
  } else if (Number(raw.duration_minutes) > 0) {
    end = new Date(start.getTime() + Number(raw.duration_minutes) * 60000);
  } else {
    end = allDay ? new Date(start) : new Date(start.getTime() + 60 * 60000);
  }
  if (end < start) return { error: 'end est avant start' };

  const reminderMinutes = raw.reminder_minutes !== undefined ? Number(raw.reminder_minutes) : defaults.reminder_minutes;

  const event = {
    title,
    description: raw.description || defaults.description || null,
    start_datetime: start.toISOString(),
    end_datetime: end.toISOString(),
    all_day: allDay,
    location: raw.location || defaults.location || null,
    category: raw.category || defaults.category || 'meeting',
    priority: raw.priority || defaults.priority || 'medium',
    color: raw.color || defaults.color || null,
    reminder_time: Number.isFinite(reminderMinutes) ? reminderMinutes : null
  };

  // Récurrence éventuelle
  const repeat = raw.repeat || raw.recurrence;
  if (repeat) {
    const mapped = mapRepeat(repeat, event.start_datetime);
    if (mapped.error) return { error: mapped.error };
    if (mapped.fields) {
      Object.assign(event, mapped.fields);
      // validateRecurrence lit start_date pour le contrôle de la date de fin
      event.start_date = event.start_datetime;
      warnings.push(...mapped.warnings);
      return { event, isRecurring: true, warnings };
    }
  }

  return { event, isRecurring: false, warnings };
}

// Extrait le tableau d'événements + defaults d'un payload tolérant (array OU { events, defaults }).
function parseImportPayload(body) {
  if (Array.isArray(body)) return { events: body, defaults: {} };
  if (body && Array.isArray(body.events)) return { events: body.events, defaults: body.defaults || {} };
  return { events: null, defaults: {} };
}

module.exports = { normalizeImportEvent, parseImportPayload, mapRepeat };
