// backend/controllers/dashboardController.js

const leadModel = require('../models/leadModel');
const projectModel = require('../models/projectModel');
const revenueModel = require('../models/revenueModel');
const activityModel = require('../models/activityModel');
const goalModel = require('../models/goalModel');

/**
 * Contrôleur pour le tableau de bord
 */
const dashboardController = {
  /**
   * Récupérer toutes les données du tableau de bord
   */
  getDashboardData: async (req, res) => {
    const db = req.app.locals.db;

    try {
      // Structure des données du tableau de bord
      const dashboardData = {
        leads: { total: 0, newThisMonth: 0, monthlyTarget: 10 },
        projects: { active: 0, completed: 0, upcoming: 0, monthlyTarget: 5 },
        revenues: { thisMonth: 0, projection: 0, total: 0, monthlyTarget: 8000 },
        activities: { completed: 0, pending: 0 },
        goals: { onTrack: 0, atRisk: 0 },
        recentActivities: [],
        projectTimeline: [],
        revenueChart: []
      };

      // Date du début du mois en cours
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      // Dates pour les calculs
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

      // Récupérer toutes les données en parallèle
      const [
        allLeads,
        allProjects,
        revenueStats,
        allRevenues,
        allActivities,
        allGoals,
        recentActivities,
        activeProjects
      ] = await Promise.all([
        leadModel.getAllLeads(db).catch(() => []),
        projectModel.getAllProjects(db).catch(() => []),
        revenueModel.getRevenueStats(db, {
          start_date: startOfMonth,
          end_date: endOfMonth
        }).catch(() => ({ total: 0, monthly: 0 })),
        revenueModel.getAllRevenues(db, {}).catch(() => []),
        activityModel.getAllActivities(db).catch(() => []),
        goalModel.getAllGoals(db).catch(() => []),
        activityModel.getRecentActivities(db, 5).catch(() => []),
        projectModel.getAllProjects(db).catch(() => [])
      ]);

      // Calculer les statistiques des leads
      dashboardData.leads.total = allLeads.length;
      dashboardData.leads.newThisMonth = allLeads.filter(lead =>
        lead.created_at && lead.created_at >= startOfMonth
      ).length;

      // Calculer les statistiques des projets
      dashboardData.projects.active = allProjects.filter(p => p.status === 'in_progress').length;
      dashboardData.projects.completed = allProjects.filter(p => p.status === 'completed').length;
      dashboardData.projects.upcoming = allProjects.filter(p =>
        p.status === 'planned' && p.start_date && p.start_date > now.toISOString().split('T')[0]
      ).length;

      // Calculer les statistiques des revenus
      dashboardData.revenues.thisMonth = revenueStats.total || 0;

      // Revenus totaux (encaissés uniquement : status 'paid', cohérent avec l'objectif revenue_cashed)
      dashboardData.revenues.total = allRevenues
        .filter(r => r.status === 'paid')
        .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

      // Projection basée sur la moyenne des 3 derniers mois (encaissés uniquement)
      const revenuesLastThreeMonths = allRevenues.filter(r =>
        r.status === 'paid' && r.date && r.date >= threeMonthsAgoStr
      );
      const totalLastThreeMonths = revenuesLastThreeMonths.reduce(
        (sum, r) => sum + (parseFloat(r.amount) || 0),
        0
      );
      dashboardData.revenues.projection = totalLastThreeMonths / 3;

      // Récupérer les objectifs pour le mois en cours
      const revenueGoal = allGoals.find(goal =>
        goal.category === 'revenue' &&
        goal.start_date <= endOfMonth &&
        goal.end_date >= startOfMonth
      );
      dashboardData.revenues.monthlyTarget = revenueGoal ? parseFloat(revenueGoal.target_value) : 8000;

      const leadsGoal = allGoals.find(goal =>
        goal.category === 'leads' &&
        goal.start_date <= endOfMonth &&
        goal.end_date >= startOfMonth
      );
      dashboardData.leads.monthlyTarget = leadsGoal ? parseInt(leadsGoal.target_value) : 10;

      const projectsGoal = allGoals.find(goal =>
        goal.category === 'projects' &&
        goal.start_date <= endOfMonth &&
        goal.end_date >= startOfMonth
      );
      dashboardData.projects.monthlyTarget = projectsGoal ? parseInt(projectsGoal.target_value) : 5;

      // Calculer les statistiques des activités
      dashboardData.activities.completed = allActivities.filter(a => a.status === 'completed').length;
      dashboardData.activities.pending = allActivities.filter(a => a.status !== 'completed').length;

      // Calculer les statistiques des objectifs
      const activeGoals = allGoals.filter(goal =>
        goal.end_date && goal.end_date >= now.toISOString().split('T')[0]
      );

      dashboardData.goals.onTrack = activeGoals.filter(goal => {
        const progress = goal.current_value / goal.target_value;
        return progress >= 0.7;
      }).length;

      dashboardData.goals.atRisk = activeGoals.filter(goal => {
        const progress = goal.current_value / goal.target_value;
        return progress < 0.7;
      }).length;

      // Activités récentes
      dashboardData.recentActivities = recentActivities;

      // Timeline des projets
      dashboardData.projectTimeline = activeProjects
        .filter(p =>
          (p.status === 'in_progress' || p.status === 'planned') &&
          p.start_date &&
          p.end_date
        )
        .map(p => ({
          id: p.id,
          name: p.name,
          start_date: p.start_date,
          end_date: p.end_date,
          status: p.status
        }))
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
        .slice(0, 10);

      // Graphique des revenus (derniers 6 mois)
      const revenuesLastSixMonths = allRevenues.filter(r =>
        r.date && r.date >= sixMonthsAgoStr
      );

      // Grouper par mois
      const revenueByMonth = {};
      revenuesLastSixMonths.forEach(r => {
        // Convertir la date en string si c'est un objet Date (PostgreSQL)
        const dateStr = r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date;
        const month = dateStr.substring(0, 7); // YYYY-MM
        if (!revenueByMonth[month]) {
          revenueByMonth[month] = 0;
        }
        revenueByMonth[month] += parseFloat(r.amount) || 0;
      });

      dashboardData.revenueChart = Object.entries(revenueByMonth)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month));

      res.json(dashboardData);
    } catch (error) {
      console.error('Erreur lors de la récupération des données du tableau de bord:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = dashboardController;
