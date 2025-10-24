// backend/utils/goalTracker.js

/**
 * Utilitaire pour le tracking automatique des objectifs
 * Met à jour les objectifs basés sur les revenus, leads, ou activités
 */
const db = require('../config/pgConfig');

const goalTracker = {
  /**
   * Met à jour la progression d'un objectif spécifique
   * @param {number} goalId - ID de l'objectif à mettre à jour
   * @returns {Promise<Object>} Objectif mis à jour
   */
  updateGoalProgress: async (goalId) => {
    return new Promise((resolve, reject) => {
      // Récupérer l'objectif
      db.get('SELECT * FROM goals WHERE id = ?', [goalId], async (err, goal) => {
        if (err) {
          console.error(`[GoalTracker] Erreur lors de la récupération de l'objectif ${goalId}:`, err);
          return reject(err);
        }

        if (!goal) {
          console.error(`[GoalTracker] Objectif ${goalId} non trouvé`);
          return reject(new Error('Objectif non trouvé'));
        }

        try {
          const currentValue = await goalTracker.calculateCurrentValue(goal);

          console.log(`[GoalTracker] Objectif ${goalId} (${goal.name}): ${currentValue}/${goal.target_value}`);

          // Mettre à jour la valeur
          db.run(
            'UPDATE goals SET current_value = ?, updated_at = ? WHERE id = ?',
            [currentValue, new Date().toISOString(), goalId],
            function(updateErr) {
              if (updateErr) {
                console.error(`[GoalTracker] Erreur lors de la mise à jour de l'objectif ${goalId}:`, updateErr);
                return reject(updateErr);
              }

              // Mettre à jour les milestones
              db.run(
                'UPDATE milestones SET achieved = CASE WHEN target <= ? THEN 1 ELSE 0 END WHERE goal_id = ?',
                [currentValue, goalId],
                (milestoneErr) => {
                  if (milestoneErr) {
                    console.error('[GoalTracker] Erreur lors de la mise à jour des milestones:', milestoneErr);
                  }

                  resolve({
                    goalId,
                    name: goal.name,
                    current_value: currentValue,
                    target_value: goal.target_value,
                    progress: Math.round((currentValue / goal.target_value) * 100)
                  });
                }
              );
            }
          );
        } catch (calcErr) {
          console.error('[GoalTracker] Erreur lors du calcul de la valeur actuelle:', calcErr);
          reject(calcErr);
        }
      });
    });
  },

  /**
   * Calcule la valeur actuelle d'un objectif basé sur sa catégorie
   * @param {Object} goal - Objectif avec category, start_date, end_date
   * @returns {Promise<number>} Valeur actuelle calculée
   */
  calculateCurrentValue: (goal) => {
    return new Promise((resolve, reject) => {
      const { category, start_date, end_date } = goal;

      switch (category) {
        case 'revenue':
        case 'sales':
          // Somme des revenus dans la période
          db.get(
            'SELECT SUM(amount) as total FROM revenues WHERE date >= ? AND date <= ?',
            [start_date, end_date],
            (err, result) => {
              if (err) return reject(err);
              resolve(result.total || 0);
            }
          );
          break;

        case 'leads':
        case 'acquisition':
          // Nombre de leads créés dans la période
          db.get(
            'SELECT COUNT(*) as total FROM leads WHERE created_at >= ? AND created_at <= ?',
            [start_date, end_date],
            (err, result) => {
              if (err) return reject(err);
              resolve(result.total || 0);
            }
          );
          break;

        case 'projects':
          // Nombre de projets créés ou complétés dans la période
          db.get(
            'SELECT COUNT(*) as total FROM projects WHERE created_at >= ? AND created_at <= ?',
            [start_date, end_date],
            (err, result) => {
              if (err) return reject(err);
              resolve(result.total || 0);
            }
          );
          break;

        case 'productivity':
        case 'time':
          // Somme du temps passé (actual_time) dans la période
          db.get(
            'SELECT SUM(actual_time) as total FROM activities WHERE date >= ? AND date <= ?',
            [start_date, end_date],
            (err, result) => {
              if (err) return reject(err);
              resolve(result.total || 0);
            }
          );
          break;

        case 'conversion':
          // Nombre de leads convertis (qui ont converted_at dans la période)
          db.get(
            'SELECT COUNT(*) as total FROM leads WHERE converted_at >= ? AND converted_at <= ? AND converted_to_project_id IS NOT NULL',
            [start_date, end_date],
            (err, result) => {
              if (err) return reject(err);
              resolve(result.total || 0);
            }
          );
          break;

        default:
          // Catégorie inconnue, retourner 0
          console.warn(`[GoalTracker] Catégorie inconnue: ${category}`);
          resolve(0);
      }
    });
  },

  /**
   * Met à jour tous les objectifs actifs (en cours)
   * @returns {Promise<Array>} Liste des objectifs mis à jour
   */
  updateAllActiveGoals: async () => {
    return new Promise((resolve, reject) => {
      // Récupérer tous les objectifs actifs (end_date >= aujourd'hui)
      db.all(
        'SELECT id FROM goals WHERE end_date >= date(\'now\')',
        [],
        async (err, goals) => {
          if (err) {
            console.error('[GoalTracker] Erreur lors de la récupération des objectifs actifs:', err);
            return reject(err);
          }

          console.log(`[GoalTracker] Mise à jour de ${goals.length} objectifs actifs...`);

          const results = [];

          for (const goal of goals) {
            try {
              const result = await goalTracker.updateGoalProgress(goal.id);
              results.push(result);
            } catch (error) {
              console.error(`[GoalTracker] Erreur lors de la mise à jour de l'objectif ${goal.id}:`, error);
              // Continuer malgré l'erreur
            }
          }

          console.log(`[GoalTracker] ${results.length}/${goals.length} objectifs mis à jour avec succès`);
          resolve(results);
        }
      );
    });
  },

  /**
   * Met à jour les objectifs affectés par un revenu
   * @param {Object} revenue - Revenu avec date, amount
   * @returns {Promise<Array>} Objectifs mis à jour
   */
  updateGoalsForRevenue: async (revenue) => {
    return new Promise((resolve, reject) => {
      // Trouver les objectifs de type 'revenue' ou 'sales' qui incluent cette date
      db.all(
        `SELECT id FROM goals
         WHERE category IN ('revenue', 'sales')
         AND start_date <= ? AND end_date >= ?`,
        [revenue.date, revenue.date],
        async (err, goals) => {
          if (err) {
            console.error('[GoalTracker] Erreur lors de la recherche des objectifs revenue:', err);
            return reject(err);
          }

          console.log(`[GoalTracker] ${goals.length} objectifs revenue affectés par le revenu`);

          const results = [];

          for (const goal of goals) {
            try {
              const result = await goalTracker.updateGoalProgress(goal.id);
              results.push(result);
            } catch (error) {
              console.error(`[GoalTracker] Erreur mise à jour objectif ${goal.id}:`, error);
            }
          }

          resolve(results);
        }
      );
    });
  },

  /**
   * Met à jour les objectifs affectés par un lead
   * @param {Object} lead - Lead avec created_at
   * @returns {Promise<Array>} Objectifs mis à jour
   */
  updateGoalsForLead: async (lead) => {
    return new Promise((resolve, reject) => {
      // Trouver les objectifs de type 'leads' qui incluent cette date de création
      db.all(
        `SELECT id FROM goals
         WHERE category IN ('leads', 'acquisition')
         AND start_date <= ? AND end_date >= ?`,
        [lead.created_at, lead.created_at],
        async (err, goals) => {
          if (err) {
            console.error('[GoalTracker] Erreur lors de la recherche des objectifs leads:', err);
            return reject(err);
          }

          console.log(`[GoalTracker] ${goals.length} objectifs leads affectés`);

          const results = [];

          for (const goal of goals) {
            try {
              const result = await goalTracker.updateGoalProgress(goal.id);
              results.push(result);
            } catch (error) {
              console.error(`[GoalTracker] Erreur mise à jour objectif ${goal.id}:`, error);
            }
          }

          resolve(results);
        }
      );
    });
  }
};

module.exports = goalTracker;
