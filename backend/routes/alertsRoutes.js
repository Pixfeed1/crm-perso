// backend/routes/alertsRoutes.js

/**
 * Routes pour le système d'alertes du CRM
 * Permet de détecter et notifier les problèmes nécessitant l'attention de l'utilisateur
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification
router.use(authMiddleware);

/**
 * GET /api/alerts/overdue-tasks
 * Retourne toutes les tâches en retard
 */
router.get('/overdue-tasks', (req, res) => {
  const db = req.app.locals.db;
  const today = new Date().toISOString().split('T')[0];

  const query = `
    SELECT
      t.id,
      t.title,
      t.description,
      t.deadline,
      t.completed,
      t.project_id,
      p.name as project_name,
      p.status as project_status,
      CAST((julianday('now') - julianday(t.deadline)) AS INTEGER) as days_overdue
    FROM tasks t
    INNER JOIN projects p ON t.project_id = p.id
    WHERE t.completed = 0
      AND t.deadline < ?
    ORDER BY t.deadline ASC
  `;

  db.all(query, [today], (err, tasks) => {
    if (err) {
      console.error('[Alerts] Erreur lors de la récupération des tâches en retard:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    res.json({
      count: tasks.length,
      severity: tasks.length > 5 ? 'critical' : tasks.length > 2 ? 'warning' : 'info',
      tasks: tasks.map(task => ({
        ...task,
        priority: task.days_overdue > 7 ? 'high' : task.days_overdue > 3 ? 'medium' : 'low',
        message: `En retard de ${task.days_overdue} jour${task.days_overdue > 1 ? 's' : ''}`
      }))
    });
  });
});

/**
 * GET /api/alerts/at-risk-goals
 * Retourne les objectifs qui risquent de ne pas être atteints
 */
router.get('/at-risk-goals', (req, res) => {
  const db = req.app.locals.db;
  const today = new Date().toISOString().split('T')[0];

  const query = `
    SELECT
      id,
      name,
      description,
      target_value,
      current_value,
      category,
      start_date,
      end_date,
      CAST(((julianday(end_date) - julianday('now')) / (julianday(end_date) - julianday(start_date))) * 100 AS INTEGER) as time_left_percent,
      CAST((current_value * 1.0 / target_value * 100) AS INTEGER) as progress_percent
    FROM goals
    WHERE end_date >= ?
      AND current_value < target_value
  `;

  db.all(query, [today], (err, goals) => {
    if (err) {
      console.error('[Alerts] Erreur lors de la récupération des objectifs à risque:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    // Filtrer les objectifs à risque (progression < temps écoulé)
    const atRiskGoals = goals.filter(goal => {
      const progressPercent = goal.progress_percent || 0;
      const timeElapsedPercent = 100 - (goal.time_left_percent || 0);

      // Objectif à risque si progression est en retard de plus de 10%
      return progressPercent < (timeElapsedPercent - 10);
    }).map(goal => {
      const progressPercent = goal.progress_percent || 0;
      const timeElapsedPercent = 100 - (goal.time_left_percent || 0);
      const gap = timeElapsedPercent - progressPercent;

      return {
        ...goal,
        time_elapsed_percent: timeElapsedPercent,
        gap_percent: gap,
        severity: gap > 30 ? 'critical' : gap > 20 ? 'warning' : 'info',
        message: `Retard de ${gap}% par rapport au calendrier`,
        needed_daily: Math.ceil((goal.target_value - goal.current_value) / Math.max(1, Math.ceil((new Date(goal.end_date) - new Date()) / (1000 * 60 * 60 * 24))))
      };
    });

    res.json({
      count: atRiskGoals.length,
      severity: atRiskGoals.length > 3 ? 'critical' : atRiskGoals.length > 1 ? 'warning' : 'info',
      goals: atRiskGoals
    });
  });
});

/**
 * GET /api/alerts/pending-activities
 * Retourne les activités planifiées en retard ou à venir
 */
router.get('/pending-activities', (req, res) => {
  const db = req.app.locals.db;
  const today = new Date().toISOString().split('T')[0];

  const query = `
    SELECT
      a.id,
      a.type,
      a.description,
      a.date,
      a.planned_time,
      a.status,
      a.priority,
      a.project_id,
      a.lead_id,
      p.name as project_name,
      l.name as lead_name,
      CAST((julianday('now') - julianday(a.date)) AS INTEGER) as days_diff
    FROM activities a
    LEFT JOIN projects p ON a.project_id = p.id
    LEFT JOIN leads l ON a.lead_id = l.id
    WHERE a.status IN ('planned', 'in_progress')
      AND a.date <= ?
    ORDER BY a.date ASC, a.priority DESC
  `;

  // Activités jusqu'à aujourd'hui qui ne sont pas complétées
  db.all(query, [today], (err, activities) => {
    if (err) {
      console.error('[Alerts] Erreur lors de la récupération des activités en attente:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    res.json({
      count: activities.length,
      severity: activities.filter(a => a.days_diff > 0).length > 3 ? 'critical' : 'warning',
      activities: activities.map(activity => ({
        ...activity,
        severity: activity.days_diff > 7 ? 'critical' : activity.days_diff > 3 ? 'warning' : 'info',
        message: activity.days_diff > 0
          ? `En retard de ${activity.days_diff} jour${activity.days_diff > 1 ? 's' : ''}`
          : `À faire aujourd'hui`
      }))
    });
  });
});

/**
 * GET /api/alerts/upcoming-deadlines
 * Retourne les échéances à venir dans les 7 prochains jours
 */
router.get('/upcoming-deadlines', (req, res) => {
  const db = req.app.locals.db;
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const query = `
    SELECT
      'task' as type,
      t.id,
      t.title as name,
      t.deadline as date,
      t.project_id,
      p.name as project_name,
      CAST((julianday(t.deadline) - julianday('now')) AS INTEGER) as days_until
    FROM tasks t
    INNER JOIN projects p ON t.project_id = p.id
    WHERE t.completed = 0
      AND t.deadline >= ?
      AND t.deadline <= ?

    UNION ALL

    SELECT
      'goal' as type,
      g.id,
      g.name,
      g.end_date as date,
      NULL as project_id,
      NULL as project_name,
      CAST((julianday(g.end_date) - julianday('now')) AS INTEGER) as days_until
    FROM goals g
    WHERE g.end_date >= ?
      AND g.end_date <= ?
      AND g.current_value < g.target_value

    UNION ALL

    SELECT
      'project' as type,
      p.id,
      p.name,
      p.end_date as date,
      NULL as project_id,
      NULL as project_name,
      CAST((julianday(p.end_date) - julianday('now')) AS INTEGER) as days_until
    FROM projects p
    WHERE p.end_date >= ?
      AND p.end_date <= ?
      AND p.status NOT IN ('completed', 'cancelled')

    ORDER BY days_until ASC, date ASC
  `;

  db.all(query, [today, nextWeekStr, today, nextWeekStr, today, nextWeekStr], (err, deadlines) => {
    if (err) {
      console.error('[Alerts] Erreur lors de la récupération des échéances:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    res.json({
      count: deadlines.length,
      severity: deadlines.filter(d => d.days_until <= 2).length > 0 ? 'warning' : 'info',
      deadlines: deadlines.map(deadline => ({
        ...deadline,
        urgency: deadline.days_until <= 1 ? 'critical' : deadline.days_until <= 3 ? 'high' : 'medium',
        message: deadline.days_until === 0
          ? `Échéance aujourd'hui`
          : deadline.days_until === 1
          ? `Échéance demain`
          : `Dans ${deadline.days_until} jours`
      }))
    });
  });
});

/**
 * GET /api/alerts/stale-leads
 * Retourne les leads sans activité récente (inactifs depuis 30+ jours)
 */
router.get('/stale-leads', (req, res) => {
  const db = req.app.locals.db;
  const { days = 30 } = req.query;

  const query = `
    SELECT
      l.id,
      l.name,
      l.company,
      l.status,
      l.source,
      l.updated_at,
      CAST((julianday('now') - julianday(l.updated_at)) AS INTEGER) as days_inactive,
      COUNT(a.id) as activity_count,
      MAX(a.date) as last_activity_date
    FROM leads l
    LEFT JOIN activities a ON l.id = a.lead_id
    WHERE l.status NOT IN ('won', 'lost', 'archived')
      AND CAST((julianday('now') - julianday(l.updated_at)) AS INTEGER) >= ?
    GROUP BY l.id
    ORDER BY days_inactive DESC
  `;

  db.all(query, [days], (err, leads) => {
    if (err) {
      console.error('[Alerts] Erreur lors de la récupération des leads inactifs:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    res.json({
      count: leads.length,
      severity: leads.filter(l => l.days_inactive > 60).length > 5 ? 'warning' : 'info',
      leads: leads.map(lead => ({
        ...lead,
        priority: lead.days_inactive > 90 ? 'high' : lead.days_inactive > 60 ? 'medium' : 'low',
        message: `Inactif depuis ${lead.days_inactive} jours`,
        suggestion: lead.days_inactive > 90
          ? 'Envisager de marquer comme perdu ou archivé'
          : lead.activity_count === 0
          ? 'Aucune activité enregistrée - planifier un premier contact'
          : 'Relancer le contact'
      }))
    });
  });
});

/**
 * GET /api/alerts/summary
 * Retourne un résumé de toutes les alertes pour le dashboard
 */
router.get('/summary', async (req, res) => {
  const db = req.app.locals.db;

  try {
    // Helper pour promisifier db.all
    const queryAsync = (query, params) => {
      return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    };

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    // Tâches en retard
    const overdueTasks = await queryAsync(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE completed = 0 AND deadline < ?
    `, [today]);

    // Activités en attente
    const pendingActivities = await queryAsync(`
      SELECT COUNT(*) as count
      FROM activities
      WHERE status IN ('planned', 'in_progress') AND date <= ?
    `, [today]);

    // Objectifs à risque (simplifié)
    const atRiskGoals = await queryAsync(`
      SELECT COUNT(*) as count
      FROM goals
      WHERE end_date >= ?
        AND current_value < target_value * 0.5
        AND end_date <= ?
    `, [today, nextWeekStr]);

    // Échéances dans 7 jours
    const upcomingDeadlines = await queryAsync(`
      SELECT COUNT(*) as count
      FROM (
        SELECT deadline as date FROM tasks
        WHERE completed = 0 AND deadline >= ? AND deadline <= ?
        UNION ALL
        SELECT end_date FROM goals
        WHERE end_date >= ? AND end_date <= ? AND current_value < target_value
        UNION ALL
        SELECT end_date FROM projects
        WHERE end_date >= ? AND end_date <= ? AND status NOT IN ('completed', 'cancelled')
      )
    `, [today, nextWeekStr, today, nextWeekStr, today, nextWeekStr]);

    // Leads inactifs
    const staleLeads = await queryAsync(`
      SELECT COUNT(*) as count
      FROM leads
      WHERE status NOT IN ('won', 'lost', 'archived')
        AND CAST((julianday('now') - julianday(updated_at)) AS INTEGER) >= 30
    `, []);

    // Calculer le niveau de sévérité global
    const totalCritical = overdueTasks[0].count + pendingActivities[0].count;
    const totalWarning = atRiskGoals[0].count + (staleLeads[0].count > 5 ? 1 : 0);

    const globalSeverity = totalCritical > 5 ? 'critical' : totalCritical > 0 ? 'warning' : 'info';

    res.json({
      summary: {
        overdue_tasks: overdueTasks[0].count,
        pending_activities: pendingActivities[0].count,
        at_risk_goals: atRiskGoals[0].count,
        upcoming_deadlines: upcomingDeadlines[0].count,
        stale_leads: staleLeads[0].count,
        total_alerts: overdueTasks[0].count + pendingActivities[0].count + atRiskGoals[0].count,
        severity: globalSeverity
      },
      message: totalCritical > 0
        ? `${totalCritical} élément${totalCritical > 1 ? 's' : ''} nécessite${totalCritical > 1 ? 'nt' : ''} votre attention immédiate`
        : totalWarning > 0
        ? `${totalWarning} objectif${totalWarning > 1 ? 's' : ''} à surveiller`
        : 'Tout est à jour !'
    });

  } catch (error) {
    console.error('[Alerts] Erreur lors de la génération du résumé:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
