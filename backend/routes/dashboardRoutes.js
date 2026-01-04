// backend/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Import des modèles
const leadModel = require('../models/leadModel');
const projectModel = require('../models/projectModel');
const revenueModel = require('../models/revenueModel');
const activityModel = require('../models/activityModel');
const goalModel = require('../models/goalModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir les données du tableau de bord
router.get('/', async (req, res) => {
  const db = req.app.locals.db;

  try {
    // Structure des données du tableau de bord
    const dashboardData = {
      leads: { total: 0, newThisMonth: 0 },
      projects: { active: 0, completed: 0, upcoming: 0 },
      revenues: { thisMonth: 0, projection: 0, total: 0 },
      activities: { completed: 0, pending: 0 },
      goals: { onTrack: 0, atRisk: 0 },
      recentActivities: [],
      projectTimeline: [],
      revenueChart: []
    };

    // Date du début du mois en cours
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Récupérer toutes les données en parallèle
    const [
      allLeads,
      allProjects,
      allRevenues,
      allActivities,
      allGoals,
      recentActivities
    ] = await Promise.all([
      leadModel.getAllLeads(db),
      projectModel.getAllProjects(db),
      revenueModel.getAllRevenues(db),
      activityModel.getAllActivities(db),
      goalModel.getAllGoals(db),
      activityModel.getRecentActivities(db, 5)
    ]);

    // Statistiques des leads
    // Compter TOUS les leads (y compris ceux convertis en clients avec statut 'won')
    dashboardData.leads.total = allLeads.length;

    // Compter seulement les NOUVEAUX leads ce mois (tous statuts)
    dashboardData.leads.newThisMonth = allLeads.filter(lead =>
      new Date(lead.created_at) >= startOfMonth
    ).length;

    // Statistiques des projets
    const now_iso = new Date().toISOString();
    dashboardData.projects.active = allProjects.filter(p =>
      p.status === 'in_progress' || p.status === 'en-cours'
    ).length;
    dashboardData.projects.completed = allProjects.filter(p =>
      p.status === 'completed' || p.status === 'terminé'
    ).length;
    dashboardData.projects.upcoming = allProjects.filter(p =>
      (p.status === 'planned' || p.status === 'planifié') &&
      p.start_date &&
      new Date(p.start_date) > new Date()
    ).length;

    // Statistiques des revenus
    const startOfMonthISO = startOfMonth.toISOString();
    dashboardData.revenues.thisMonth = allRevenues
      .filter(r => r.date && r.date >= startOfMonthISO)
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    dashboardData.revenues.total = allRevenues
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    // Projection basée sur la moyenne des 3 derniers mois
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoISO = threeMonthsAgo.toISOString();
    const recentRevenues = allRevenues.filter(r => r.date >= threeMonthsAgoISO);
    dashboardData.revenues.projection = recentRevenues.length > 0
      ? recentRevenues.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0) / 3
      : 0;

    // Statistiques des activités
    dashboardData.activities.completed = allActivities.filter(a =>
      a.status === 'completed' || a.status === 'terminé'
    ).length;
    dashboardData.activities.pending = allActivities.filter(a =>
      a.status !== 'completed' && a.status !== 'terminé'
    ).length;

    // Statistiques des objectifs
    const activeGoals = allGoals.filter(g =>
      !g.end_date || new Date(g.end_date) >= new Date()
    );
    activeGoals.forEach(goal => {
      const progress = (goal.current_value || 0) / (goal.target_value || 1);
      // Si la progression est supérieure à 70%, considérer comme "sur la bonne voie"
      if (progress >= 0.7) {
        dashboardData.goals.onTrack++;
      } else {
        dashboardData.goals.atRisk++;
      }
    });

    // Activités récentes (déjà récupérées)
    dashboardData.recentActivities = recentActivities;

    // Timeline des projets (projets en cours ou planifiés)
    dashboardData.projectTimeline = allProjects
      .filter(p =>
        (p.status === 'in_progress' || p.status === 'en-cours' ||
         p.status === 'planned' || p.status === 'planifié') &&
        p.start_date && p.end_date
      )
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .slice(0, 10)
      .map(p => ({
        id: p.id,
        name: p.name,
        start_date: p.start_date,
        end_date: p.end_date,
        status: p.status
      }));

    // Données du graphique des revenus (derniers 6 mois)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const revenuesByMonth = {};

    // Initialiser tous les mois
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      const month = date.toISOString().substring(0, 7); // YYYY-MM
      revenuesByMonth[month] = 0;
    }

    // Calculer les revenus par mois
    allRevenues
      .filter(r => r.date && new Date(r.date) >= sixMonthsAgo)
      .forEach(r => {
        // Convertir la date en string si c'est un objet Date (PostgreSQL)
        const dateStr = r.date instanceof Date ? r.date.toISOString() : r.date;
        const month = dateStr.substring(0, 7); // YYYY-MM
        if (revenuesByMonth[month] !== undefined) {
          revenuesByMonth[month] += parseFloat(r.amount) || 0;
        }
      });

    // Convertir en tableau pour le graphique
    dashboardData.revenueChart = Object.entries(revenuesByMonth)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json(dashboardData);
  } catch (error) {
    console.error('[Dashboard] Erreur lors de la récupération des données:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router;
