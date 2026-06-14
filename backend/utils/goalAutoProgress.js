// backend/utils/goalAutoProgress.js
//
// Catégories d'objectifs "métier" dont le réalisé (current_value) est calculé
// AUTOMATIQUEMENT en agrégeant la table source sur la période [start_date, end_date]
// de l'objectif. Les catégories manuelles (personal/marketing/productivity/leads/revenue)
// ne figurent PAS ici : leur current_value reste saisi à la main (comportement existant).
//
// Bornes inclusives par jour : col >= start::date AND col < (end::date + 1 jour),
// ce qui fonctionne aussi bien pour les colonnes DATE que TIMESTAMP.

const AUTO_GOAL_CATEGORIES = {
  maintenance_signed: {
    label: 'Contrats de maintenance',
    sql: `SELECT COUNT(*)::float AS v FROM maintenance_contracts
          WHERE status = 'active'
            AND contract_start_date >= $1::date
            AND contract_start_date < ($2::date + INTERVAL '1 day')`
  },
  subscriptions: {
    label: 'Abonnements',
    sql: `SELECT COUNT(*)::float AS v FROM subscriptions
          WHERE billing_status = 'active'
            AND created_at >= $1::date
            AND created_at < ($2::date + INTERVAL '1 day')`
  },
  new_clients: {
    label: 'Nouveaux clients',
    sql: `SELECT COUNT(*)::float AS v FROM crm_clients
          WHERE created_at >= $1::date
            AND created_at < ($2::date + INTERVAL '1 day')`
  },
  quotes_sent: {
    label: 'Devis envoyés',
    sql: `SELECT COUNT(*)::float AS v FROM quotes
          WHERE sent_at IS NOT NULL
            AND sent_at >= $1::date
            AND sent_at < ($2::date + INTERVAL '1 day')`
  },
  projects_signed: {
    label: 'Projets / contrats',
    sql: `SELECT COUNT(*)::float AS v FROM projects
          WHERE created_at >= $1::date
            AND created_at < ($2::date + INTERVAL '1 day')`
  },
  revenue_cashed: {
    label: 'CA encaissé',
    sql: `SELECT COALESCE(SUM(amount), 0)::float AS v FROM revenues
          WHERE status = 'paid'
            AND date >= $1::date
            AND date < ($2::date + INTERVAL '1 day')`
  },
  prospects_contacted: {
    label: 'Prospects contactés',
    sql: `SELECT COUNT(*)::float AS v FROM leads
          WHERE status = 'contacte'
            AND updated_at >= $1::date
            AND updated_at < ($2::date + INTERVAL '1 day')`
  }
};

const isAutoCategory = (category) =>
  Object.prototype.hasOwnProperty.call(AUTO_GOAL_CATEGORIES, category);

// Calcule la valeur réalisée d'un objectif auto. Renvoie null en cas d'échec
// (table absente, erreur SQL...) afin de conserver la valeur stockée en repli.
async function computeAutoValue(pool, goal) {
  const def = AUTO_GOAL_CATEGORIES[goal.category];
  if (!def || !pool || !goal.start_date || !goal.end_date) return null;
  try {
    const { rows } = await pool.query(def.sql, [goal.start_date, goal.end_date]);
    return rows && rows[0] ? Number(rows[0].v) || 0 : 0;
  } catch (err) {
    console.error(`[goalAutoProgress] Échec calcul auto (${goal.category}):`, err.message);
    return null;
  }
}

// Enrichit une liste d'objectifs : pour les catégories auto, remplace current_value
// par la valeur calculée live et marque auto:true. Ne touche pas aux catégories manuelles.
async function enrichGoalsWithAuto(pool, goals) {
  if (!Array.isArray(goals)) return goals;
  await Promise.all(goals.map(async (goal) => {
    if (goal && isAutoCategory(goal.category)) {
      const v = await computeAutoValue(pool, goal);
      if (v !== null) goal.current_value = v;
      goal.auto = true;
    }
  }));
  return goals;
}

module.exports = { AUTO_GOAL_CATEGORIES, isAutoCategory, computeAutoValue, enrichGoalsWithAuto };
