// src/utils/goalPace.js
//
// Indicateur de rythme d'un objectif et liste des catégories "métier" auto-calculées.
// Le rythme compare le % de temps écoulé dans la période au % réalisé, et propose
// le rythme nécessaire pour tenir l'objectif. Classes basées sur les tokens sémantiques.

// Catégories dont le réalisé est calculé automatiquement côté backend (voir
// backend/utils/goalAutoProgress.js). current_value y est en lecture seule.
export const AUTO_GOAL_CATEGORIES = [
  'maintenance_signed',
  'subscriptions',
  'new_clients',
  'quotes_sent',
  'projects_signed',
  'revenue_cashed',
  'prospects_contacted'
];

export const isAutoGoalCategory = (category) => AUTO_GOAL_CATEGORIES.includes(category);

export const PACE_META = {
  ahead:   { label: 'En avance',       cls: 'bg-success-bg text-success-text' },
  on_time: { label: 'Dans les temps',  cls: 'bg-info-bg text-info-text' },
  behind:  { label: 'En retard',       cls: 'bg-danger-bg text-danger-text' },
  done:    { label: 'Atteint',         cls: 'bg-success-bg text-success-text' },
  ended:   { label: 'Terminé',         cls: 'bg-neutral-bg text-neutral-text' }
};

// Calcule l'état de rythme d'un objectif.
export function computePace(goal) {
  const start = new Date(goal.start_date);
  const end = new Date(goal.end_date);
  const now = new Date();
  const target = Number(goal.target_value) || 0;
  const current = Number(goal.current_value) || 0;

  const totalMs = end - start;
  const elapsedMs = totalMs > 0 ? Math.min(Math.max(now - start, 0), totalMs) : 0;
  const timePct = totalMs > 0 ? elapsedMs / totalMs : (now > end ? 1 : 0);
  const progressPct = target > 0 ? Math.min(current / target, 1) : 0;
  const remaining = Math.max(0, target - current);

  const dayMs = 86400000;
  const daysLeft = Math.max(0, Math.ceil((end - now) / dayMs));

  let status = 'on_time';
  if (progressPct >= 1) status = 'done';
  else if (now > end) status = 'ended';
  else if (progressPct >= timePct + 0.1) status = 'ahead';
  else if (progressPct < timePct - 0.1) status = 'behind';

  // Rythme nécessaire : reste à faire / sous-périodes restantes.
  // Unité : /jour pour un objectif hebdo, sinon /semaine.
  let rateUnit = 'semaine';
  let unitsLeft = daysLeft / 7;
  if (goal.period === 'weekly') { rateUnit = 'jour'; unitsLeft = daysLeft; }
  const ratePerUnit = unitsLeft > 0 ? remaining / unitsLeft : remaining;

  return { timePct, progressPct, remaining, daysLeft, status, rateUnit, ratePerUnit };
}
