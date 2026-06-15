// src/utils/eventStyles.js
//
// Styles centralisés des événements du calendrier (catégorie + priorité).
// Source unique réutilisée par toutes les vues (mois/semaine/jour/timeline) et la
// fiche détail : supprime la duplication des "config couleurs" et applique les tokens
// de thème sémantiques (aucune couleur en dur).
import { FiUsers, FiPhone, FiClock, FiCheck, FiHome, FiCalendar } from 'react-icons/fi';

// Catégorie -> libellé, icône, et classes (badge compact + bloc plein sur la grille).
export const EVENT_CATEGORIES = {
  meeting:  { label: 'Réunion',   Icon: FiUsers, badge: 'bg-info-bg text-info-text',       block: 'bg-info-bg text-info-text border border-info-text/30' },
  call:     { label: 'Appel',     Icon: FiPhone, badge: 'bg-success-bg text-success-text', block: 'bg-success-bg text-success-text border border-success-text/30' },
  deadline: { label: 'Échéance',  Icon: FiClock, badge: 'bg-warning-bg text-warning-text', block: 'bg-warning-bg text-warning-text border border-warning-text/30' },
  task:     { label: 'Tâche',     Icon: FiCheck, badge: 'bg-accent/15 text-accent',         block: 'bg-accent/15 text-accent border border-accent/40' },
  personal: { label: 'Personnel', Icon: FiHome,  badge: 'bg-danger-bg text-danger-text',   block: 'bg-danger-bg text-danger-text border border-danger-text/30' }
};

const CATEGORY_FALLBACK = {
  label: 'Événement', Icon: FiCalendar,
  badge: 'bg-neutral-bg text-neutral-text',
  block: 'bg-neutral-bg text-neutral-text border border-border'
};

export const categoryMeta = (category) => EVENT_CATEGORIES[category] || CATEGORY_FALLBACK;

// Priorité -> libellé + classes badge + bordure gauche (sur les blocs d'événement).
export const EVENT_PRIORITIES = {
  low:      { label: 'Basse',    badge: 'bg-neutral-bg text-neutral-text', borderL: 'border-l-neutral-text' },
  medium:   { label: 'Moyenne',  badge: 'bg-info-bg text-info-text',       borderL: 'border-l-info-text' },
  high:     { label: 'Haute',    badge: 'bg-warning-bg text-warning-text', borderL: 'border-l-warning-text' },
  critical: { label: 'Critique', badge: 'bg-danger-bg text-danger-text',   borderL: 'border-l-danger-text' }
};

export const priorityMeta = (priority) => EVENT_PRIORITIES[priority] || EVENT_PRIORITIES.low;
