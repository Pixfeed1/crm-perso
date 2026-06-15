// src/utils/calendarEvents.js
//
// Utilitaires partagés par toutes les vues du calendrier (mois/semaine/jour).
// Évite la triple duplication de getEventsForDay / calculateEventPosition et
// indexe les événements par jour pour un accès O(1) (au lieu d'un filter O(n)
// répété pour chaque cellule de la grille).

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Construit un index { jour -> événements } et renvoie une fonction (date) => events[].
// À mémoïser avec [events] dans le composant pour ne reconstruire l'index qu'au besoin.
export function getEventsForDay(events) {
  const map = new Map();
  (events || []).forEach((event) => {
    const d = new Date(event.start_datetime);
    if (isNaN(d.getTime())) return;
    const key = dayKey(d);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
  });
  return (date) => map.get(dayKey(date)) || [];
}

// Position verticale d'un événement dans une grille horaire (vues semaine/jour).
// startHour/endHour = bornes affichées (def. 0..24). Renvoie des pourcentages.
export function calculateEventPosition(event, startHour = 0, endHour = 24) {
  const start = new Date(event.start_datetime);
  const end = event.end_datetime ? new Date(event.end_datetime) : new Date(start.getTime() + 60 * 60 * 1000);
  const totalHours = Math.max(1, endHour - startHour);

  const startMinutes = (start.getHours() - startHour) * 60 + start.getMinutes();
  const endMinutes = (end.getHours() - startHour) * 60 + end.getMinutes();

  const top = Math.max(0, (startMinutes / (totalHours * 60)) * 100);
  const rawHeight = ((endMinutes - startMinutes) / (totalHours * 60)) * 100;
  const height = Math.max(2, Math.min(100 - top, rawHeight));

  return { top, height };
}
