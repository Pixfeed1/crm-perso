// backend/routes/statsRoutes.js

/**
 * Routes pour les statistiques avancées
 * ROI, productivité, rentabilité, et analyses approfondies
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification
router.use(authMiddleware);

/**
 * GET /api/stats/roi-by-project
 * Calcule le ROI (Return on Investment) par projet
 */
router.get('/roi-by-project', (req, res) => {
  const db = req.app.locals.db;

  const query = `
    SELECT
      p.id,
      p.name,
      p.type,
      p.status,
      p.amount as estimated_value,
      p.start_date,
      p.end_date,
      COALESCE(SUM(r.amount), 0) as total_revenue,
      COALESCE(SUM(a.actual_time), 0) as total_hours,
      COUNT(DISTINCT a.id) as activity_count,
      COUNT(DISTINCT t.id) as task_count,
      COUNT(CASE WHEN t.completed = 1 THEN 1 END) as completed_tasks,
      l.name as lead_name,
      l.source as lead_source
    FROM projects p
    LEFT JOIN revenues r ON p.id = r.project_id
    LEFT JOIN activities a ON p.id = a.project_id
    LEFT JOIN tasks t ON p.id = t.project_id
    LEFT JOIN leads l ON p.lead_id = l.id
    GROUP BY p.id
    ORDER BY total_revenue DESC
  `;

  db.all(query, [], (err, projects) => {
    if (err) {
      console.error('[Stats] Erreur lors du calcul du ROI par projet:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    // Paramètres de coût (à configurer selon l'entreprise)
    const hourlyRate = 50; // Coût horaire moyen
    const fixedCosts = 500; // Coûts fixes par projet

    const projectsWithROI = projects.map(project => {
      const totalCost = (project.total_hours * hourlyRate) + fixedCosts;
      const profit = project.total_revenue - totalCost;
      const roi = totalCost > 0 ? ((profit / totalCost) * 100) : 0;
      const profitMargin = project.total_revenue > 0
        ? ((profit / project.total_revenue) * 100)
        : 0;

      // Calcul de la durée du projet
      const duration = project.start_date && project.end_date
        ? Math.ceil((new Date(project.end_date) - new Date(project.start_date)) / (1000 * 60 * 60 * 24))
        : null;

      return {
        ...project,
        total_cost: Math.round(totalCost),
        profit: Math.round(profit),
        roi: Math.round(roi * 10) / 10,
        profit_margin: Math.round(profitMargin * 10) / 10,
        duration_days: duration,
        revenue_per_hour: project.total_hours > 0
          ? Math.round(project.total_revenue / project.total_hours)
          : 0,
        completion_rate: project.task_count > 0
          ? Math.round((project.completed_tasks / project.task_count) * 100)
          : 0,
        performance: roi > 50 ? 'excellent' : roi > 20 ? 'good' : roi > 0 ? 'moderate' : 'poor'
      };
    });

    // Statistiques globales
    const totalRevenue = projectsWithROI.reduce((sum, p) => sum + p.total_revenue, 0);
    const totalCost = projectsWithROI.reduce((sum, p) => sum + p.total_cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgROI = projectsWithROI.length > 0
      ? projectsWithROI.reduce((sum, p) => sum + p.roi, 0) / projectsWithROI.length
      : 0;

    res.json({
      projects: projectsWithROI,
      summary: {
        total_projects: projectsWithROI.length,
        total_revenue: Math.round(totalRevenue),
        total_cost: Math.round(totalCost),
        total_profit: Math.round(totalProfit),
        avg_roi: Math.round(avgROI * 10) / 10,
        profitable_projects: projectsWithROI.filter(p => p.profit > 0).length,
        loss_projects: projectsWithROI.filter(p => p.profit < 0).length
      },
      assumptions: {
        hourly_rate: hourlyRate,
        fixed_costs: fixedCosts,
        note: "Ajuster ces valeurs selon votre structure de coûts réelle"
      }
    });
  });
});

/**
 * GET /api/stats/productivity
 * Analyse de productivité par type d'activité et tendances
 */
router.get('/productivity', (req, res) => {
  const db = req.app.locals.db;

  const query = `
    SELECT
      a.type,
      COUNT(a.id) as activity_count,
      SUM(a.planned_time) as total_planned,
      SUM(a.actual_time) as total_actual,
      AVG(a.planned_time) as avg_planned,
      AVG(a.actual_time) as avg_actual,
      SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
      COUNT(DISTINCT a.project_id) as projects_involved,
      COUNT(DISTINCT a.lead_id) as leads_involved
    FROM activities a
    WHERE a.date >= date('now', '-6 months')
    GROUP BY a.type
    ORDER BY total_actual DESC
  `;

  db.all(query, [], (err, productivityData) => {
    if (err) {
      console.error('[Stats] Erreur lors de l\'analyse de productivité:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    const enrichedData = productivityData.map(data => {
      const efficiency = data.total_planned > 0
        ? Math.round((data.total_actual / data.total_planned) * 100)
        : 100;

      const completionRate = data.activity_count > 0
        ? Math.round((data.completed_count / data.activity_count) * 100)
        : 0;

      return {
        type: data.type,
        activity_count: data.activity_count,
        total_hours_planned: Math.round(data.total_planned * 10) / 10,
        total_hours_actual: Math.round(data.total_actual * 10) / 10,
        avg_hours_per_activity: Math.round(data.avg_actual * 10) / 10,
        efficiency_percent: efficiency,
        completion_rate: completionRate,
        projects_involved: data.projects_involved,
        leads_involved: data.leads_involved,
        time_variance: Math.round((data.total_actual - data.total_planned) * 10) / 10,
        assessment: efficiency < 80 ? 'over_budget' : efficiency > 120 ? 'under_estimated' : 'on_track'
      };
    });

    // Tendance mensuelle des 6 derniers mois
    db.all(`
      SELECT
        strftime('%Y-%m', date) as month,
        SUM(actual_time) as hours,
        COUNT(id) as count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM activities
      WHERE date >= date('now', '-6 months')
      GROUP BY month
      ORDER BY month ASC
    `, [], (err, monthlyData) => {
      if (err) {
        console.error('[Stats] Erreur lors de la récupération des données mensuelles:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      const totalActivities = enrichedData.reduce((sum, d) => sum + d.activity_count, 0);
      const totalHours = enrichedData.reduce((sum, d) => sum + d.total_hours_actual, 0);

      res.json({
        by_type: enrichedData,
        monthly_trend: monthlyData.map(m => ({
          month: m.month,
          hours: Math.round(m.hours * 10) / 10,
          activity_count: m.count,
          completed: m.completed,
          completion_rate: m.count > 0 ? Math.round((m.completed / m.count) * 100) : 0
        })),
        summary: {
          total_activities: totalActivities,
          total_hours: Math.round(totalHours * 10) / 10,
          avg_hours_per_activity: totalActivities > 0
            ? Math.round((totalHours / totalActivities) * 10) / 10
            : 0,
          most_time_consuming: enrichedData.length > 0 ? enrichedData[0].type : null,
          period: '6 derniers mois'
        }
      });
    });
  });
});

/**
 * GET /api/stats/revenue-analysis
 * Analyse approfondie des revenus (tendances, saisonnalité, prévisions)
 */
router.get('/revenue-analysis', (req, res) => {
  const db = req.app.locals.db;

  // Revenus par mois
  db.all(`
    SELECT
      strftime('%Y-%m', date) as month,
      SUM(amount) as revenue,
      COUNT(id) as transaction_count,
      AVG(amount) as avg_transaction,
      type,
      status
    FROM revenues
    WHERE date >= date('now', '-12 months')
    GROUP BY month, type, status
    ORDER BY month ASC, type
  `, [], (err, monthlyRevenue) => {
    if (err) {
      console.error('[Stats] Erreur lors de l\'analyse des revenus:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    // Agrégation par mois (tous types confondus)
    const monthlyTotals = {};
    monthlyRevenue.forEach(row => {
      if (!monthlyTotals[row.month]) {
        monthlyTotals[row.month] = {
          month: row.month,
          total_revenue: 0,
          transaction_count: 0,
          by_type: {},
          by_status: {}
        };
      }
      monthlyTotals[row.month].total_revenue += row.revenue;
      monthlyTotals[row.month].transaction_count += row.transaction_count;

      // Par type
      if (!monthlyTotals[row.month].by_type[row.type]) {
        monthlyTotals[row.month].by_type[row.type] = 0;
      }
      monthlyTotals[row.month].by_type[row.type] += row.revenue;

      // Par statut
      if (!monthlyTotals[row.month].by_status[row.status]) {
        monthlyTotals[row.month].by_status[row.status] = 0;
      }
      monthlyTotals[row.month].by_status[row.status] += row.revenue;
    });

    const timeSeriesData = Object.values(monthlyTotals).map(m => ({
      month: m.month,
      revenue: Math.round(m.total_revenue),
      transaction_count: m.transaction_count,
      avg_transaction: m.transaction_count > 0
        ? Math.round(m.total_revenue / m.transaction_count)
        : 0,
      by_type: m.by_type,
      by_status: m.by_status
    }));

    // Calcul de tendance (régression linéaire simple)
    const avgRevenue = timeSeriesData.length > 0
      ? timeSeriesData.reduce((sum, m) => sum + m.revenue, 0) / timeSeriesData.length
      : 0;

    const recentAvg = timeSeriesData.length >= 3
      ? timeSeriesData.slice(-3).reduce((sum, m) => sum + m.revenue, 0) / 3
      : avgRevenue;

    const trend = recentAvg > avgRevenue * 1.1 ? 'growing' : recentAvg < avgRevenue * 0.9 ? 'declining' : 'stable';

    // Meilleur et pire mois
    const bestMonth = timeSeriesData.length > 0
      ? timeSeriesData.reduce((best, current) => current.revenue > best.revenue ? current : best)
      : null;

    const worstMonth = timeSeriesData.length > 0
      ? timeSeriesData.reduce((worst, current) => current.revenue < worst.revenue ? current : worst)
      : null;

    // Répartition par type global
    db.all(`
      SELECT
        type,
        SUM(amount) as total,
        COUNT(id) as count,
        AVG(amount) as avg
      FROM revenues
      WHERE date >= date('now', '-12 months')
      GROUP BY type
      ORDER BY total DESC
    `, [], (err, byType) => {
      if (err) {
        console.error('[Stats] Erreur lors de l\'analyse par type:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      const totalRevenue = byType.reduce((sum, t) => sum + t.total, 0);

      res.json({
        monthly_timeline: timeSeriesData,
        by_type: byType.map(t => ({
          type: t.type,
          total_revenue: Math.round(t.total),
          transaction_count: t.count,
          avg_transaction: Math.round(t.avg),
          percentage: totalRevenue > 0 ? Math.round((t.total / totalRevenue) * 100) : 0
        })),
        summary: {
          period: '12 derniers mois',
          total_revenue: Math.round(totalRevenue),
          avg_monthly: Math.round(avgRevenue),
          recent_avg: Math.round(recentAvg),
          trend: trend,
          trend_description: trend === 'growing'
            ? 'Revenus en croissance'
            : trend === 'declining'
            ? 'Revenus en baisse'
            : 'Revenus stables',
          best_month: bestMonth ? {
            month: bestMonth.month,
            revenue: bestMonth.revenue
          } : null,
          worst_month: worstMonth ? {
            month: worstMonth.month,
            revenue: worstMonth.revenue
          } : null,
          volatility: bestMonth && worstMonth
            ? Math.round(((bestMonth.revenue - worstMonth.revenue) / avgRevenue) * 100)
            : 0
        }
      });
    });
  });
});

/**
 * GET /api/stats/performance-overview
 * Vue d'ensemble de la performance globale (KPIs clés)
 */
router.get('/performance-overview', async (req, res) => {
  const db = req.app.locals.db;

  try {
    // Helper pour promisifier db.get
    const getAsync = (query, params = []) => {
      return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    };

    const [
      projectStats,
      leadStats,
      revenueStats,
      goalStats,
      activityStats
    ] = await Promise.all([
      // Projets
      getAsync(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          AVG(progress) as avg_progress
        FROM projects
      `),
      // Leads
      getAsync(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'won' THEN 1 END) as won,
          COUNT(CASE WHEN status = 'lost' THEN 1 END) as lost,
          COUNT(CASE WHEN status NOT IN ('won', 'lost', 'archived') THEN 1 END) as active
        FROM leads
      `),
      // Revenus
      getAsync(`
        SELECT
          SUM(amount) as total,
          COUNT(*) as count,
          AVG(amount) as avg
        FROM revenues
        WHERE date >= date('now', '-12 months')
      `),
      // Objectifs
      getAsync(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN current_value >= target_value THEN 1 END) as achieved,
          AVG(CASE WHEN target_value > 0 THEN (current_value * 100.0 / target_value) ELSE 0 END) as avg_progress
        FROM goals
        WHERE end_date >= date('now')
      `),
      // Activités
      getAsync(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          SUM(actual_time) as total_hours
        FROM activities
        WHERE date >= date('now', '-30 days')
      `)
    ]);

    // Calcul de scores de santé
    const projectHealth = projectStats.total > 0
      ? Math.round((projectStats.completed / projectStats.total) * 100)
      : 0;

    const leadHealth = (leadStats.won + leadStats.lost) > 0
      ? Math.round((leadStats.won / (leadStats.won + leadStats.lost)) * 100)
      : 0;

    const goalHealth = goalStats.total > 0
      ? Math.round(goalStats.avg_progress)
      : 0;

    const activityHealth = activityStats.total > 0
      ? Math.round((activityStats.completed / activityStats.total) * 100)
      : 0;

    // Score global (moyenne pondérée)
    const globalScore = Math.round(
      (projectHealth * 0.3 +
      leadHealth * 0.3 +
      goalHealth * 0.25 +
      activityHealth * 0.15)
    );

    res.json({
      overall_health_score: globalScore,
      health_status: globalScore >= 80 ? 'excellent' : globalScore >= 60 ? 'good' : globalScore >= 40 ? 'fair' : 'needs_attention',
      kpis: {
        projects: {
          total: projectStats.total,
          completed: projectStats.completed,
          in_progress: projectStats.in_progress,
          avg_progress: Math.round(projectStats.avg_progress || 0),
          health: projectHealth
        },
        leads: {
          total: leadStats.total,
          won: leadStats.won,
          lost: leadStats.lost,
          active: leadStats.active,
          win_rate: leadHealth,
          health: leadHealth
        },
        revenue: {
          total_12m: Math.round(revenueStats.total || 0),
          transaction_count: revenueStats.count || 0,
          avg_transaction: Math.round(revenueStats.avg || 0),
          monthly_avg: Math.round((revenueStats.total || 0) / 12)
        },
        goals: {
          total: goalStats.total || 0,
          achieved: goalStats.achieved || 0,
          avg_progress: Math.round(goalStats.avg_progress || 0),
          achievement_rate: goalStats.total > 0
            ? Math.round((goalStats.achieved / goalStats.total) * 100)
            : 0,
          health: goalHealth
        },
        activity: {
          total_30d: activityStats.total || 0,
          completed_30d: activityStats.completed || 0,
          total_hours_30d: Math.round((activityStats.total_hours || 0) * 10) / 10,
          completion_rate: activityHealth,
          health: activityHealth
        }
      },
      recommendations: generateRecommendations(globalScore, {
        projectHealth,
        leadHealth,
        goalHealth,
        activityHealth
      })
    });

  } catch (error) {
    console.error('[Stats] Erreur lors du calcul de la performance globale:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * Génère des recommandations basées sur les scores
 */
function generateRecommendations(globalScore, scores) {
  const recommendations = [];

  if (scores.projectHealth < 50) {
    recommendations.push({
      priority: 'high',
      category: 'projects',
      message: 'Taux de complétion des projets faible. Revoir la planification et les ressources.',
      action: 'Analyser les projets bloqués et ajuster les délais'
    });
  }

  if (scores.leadHealth < 40) {
    recommendations.push({
      priority: 'high',
      category: 'leads',
      message: 'Taux de conversion des leads préoccupant. Optimiser le processus commercial.',
      action: 'Former l\'équipe commerciale et revoir la qualification des leads'
    });
  }

  if (scores.goalHealth < 60) {
    recommendations.push({
      priority: 'medium',
      category: 'goals',
      message: 'Objectifs en retard. Revoir les cibles ou intensifier les efforts.',
      action: 'Analyser les objectifs à risque et ajuster les stratégies'
    });
  }

  if (scores.activityHealth < 70) {
    recommendations.push({
      priority: 'medium',
      category: 'activity',
      message: 'Taux de complétion des activités à améliorer.',
      action: 'Mieux prioriser les tâches et éliminer les blocages'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      category: 'overall',
      message: 'Excellentes performances ! Continuer sur cette lancée.',
      action: 'Maintenir les bonnes pratiques actuelles'
    });
  }

  return recommendations;
}

module.exports = router;
