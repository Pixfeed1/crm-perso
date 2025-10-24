// backend/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

console.log('[DASHBOARD] Module dashboardRoutes chargé');

// Middleware de logs pour toutes les requêtes du tableau de bord
router.use((req, res, next) => {
  console.log(`[DASHBOARD] Requête ${req.method} reçue sur ${req.originalUrl} à ${new Date().toISOString()}`);
  console.log(`[DASHBOARD] Utilisateur: ${req.user ? JSON.stringify(req.user) : 'Non authentifié'}`);
  console.log(`[DASHBOARD] Paramètres: ${JSON.stringify(req.params)}`);
  console.log(`[DASHBOARD] Query: ${JSON.stringify(req.query)}`);
  console.log(`[DASHBOARD] Body: ${JSON.stringify(req.body)}`);
  next();
});

// Appliquer le middleware d'authentification à toutes les routes
console.log('[DASHBOARD] Application du middleware d\'authentification');
router.use(authMiddleware);

// Obtenir les données du tableau de bord
router.get('/', async (req, res) => {
  console.log('[DASHBOARD] Début de la récupération des données du tableau de bord');
  console.log(`[DASHBOARD] Utilisateur authentifié: ID=${req.user.id}, Rôle=${req.user.role || 'N/A'}`);
  
  const db = req.app.locals.db;
  console.log('[DASHBOARD] Connexion à la base de données obtenue');
  
  try {
    console.log('[DASHBOARD] Initialisation de la structure des données du tableau de bord');
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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    console.log(`[DASHBOARD] Date de début du mois en cours: ${startOfMonth}`);
    
    // Récupérer les statistiques des leads
    console.log('[DASHBOARD] Début de la récupération des statistiques des leads');
    const leadsPromise = new Promise((resolve, reject) => {
      console.log('[DASHBOARD] Exécution de la requête pour compter le total des leads');
      db.get('SELECT COUNT(*) as total FROM leads', [], (err, result) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors du comptage des leads:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else {
          dashboardData.leads.total = result.total || 0;
          console.log(`[DASHBOARD] Nombre total de leads: ${dashboardData.leads.total}`);
          
          // Compter les nouveaux leads du mois
          console.log('[DASHBOARD] Exécution de la requête pour compter les nouveaux leads du mois');
          db.get(`
            SELECT COUNT(*) as newLeads 
            FROM leads 
            WHERE created_at >= ?
          `, [startOfMonth], (err, result) => {
            if (err) {
              console.error('[DASHBOARD] Erreur lors du comptage des nouveaux leads:', err);
              console.error('[DASHBOARD] Stack trace:', err.stack);
              // Continuer malgré l'erreur
            } else {
              dashboardData.leads.newThisMonth = result.newLeads || 0;
              console.log(`[DASHBOARD] Nombre de nouveaux leads ce mois: ${dashboardData.leads.newThisMonth}`);
            }
            console.log('[DASHBOARD] Promesse de récupération des leads résolue');
            resolve();
          });
        }
      });
    });
    
    // Récupérer les statistiques des projets
    console.log('[DASHBOARD] Début de la récupération des statistiques des projets');
    const projectsPromise = new Promise((resolve, reject) => {
      console.log('[DASHBOARD] Exécution de la requête pour compter les projets par statut');
      db.all(`
        SELECT 
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'planned' AND start_date > date('now') THEN 1 ELSE 0 END) as upcoming
        FROM projects
      `, [], (err, results) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors du comptage des projets:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else if (results.length > 0) {
          const result = results[0];
          dashboardData.projects.active = result.active || 0;
          dashboardData.projects.completed = result.completed || 0;
          dashboardData.projects.upcoming = result.upcoming || 0;
          console.log(`[DASHBOARD] Statistiques des projets - Actifs: ${dashboardData.projects.active}, Terminés: ${dashboardData.projects.completed}, À venir: ${dashboardData.projects.upcoming}`);
        } else {
          console.log('[DASHBOARD] Aucun résultat trouvé pour les statistiques des projets');
        }
        console.log('[DASHBOARD] Promesse de récupération des projets résolue');
        resolve();
      });
    });
    
    // Récupérer les statistiques des revenus
    console.log('[DASHBOARD] Début de la récupération des statistiques des revenus');
    const revenuesPromise = new Promise((resolve, reject) => {
      // Revenus du mois en cours
      console.log('[DASHBOARD] Exécution de la requête pour calculer les revenus du mois en cours');
      db.get(`
        SELECT SUM(amount) as monthTotal 
        FROM revenues 
        WHERE date >= ?
      `, [startOfMonth], (err, result) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors du calcul des revenus du mois:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else {
          dashboardData.revenues.thisMonth = result.monthTotal || 0;
          console.log(`[DASHBOARD] Revenus du mois en cours: ${dashboardData.revenues.thisMonth}`);
          
          // Revenus totaux
          console.log('[DASHBOARD] Exécution de la requête pour calculer les revenus totaux');
          db.get('SELECT SUM(amount) as total FROM revenues', [], (err, result) => {
            if (err) {
              console.error('[DASHBOARD] Erreur lors du calcul des revenus totaux:', err);
              console.error('[DASHBOARD] Stack trace:', err.stack);
              // Continuer malgré l'erreur
            } else {
              dashboardData.revenues.total = result.total || 0;
              console.log(`[DASHBOARD] Revenus totaux: ${dashboardData.revenues.total}`);
              
              // Projection basée sur la moyenne des 3 derniers mois
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];
              console.log(`[DASHBOARD] Date il y a trois mois: ${threeMonthsAgoStr}`);
              
              console.log('[DASHBOARD] Exécution de la requête pour calculer la projection des revenus');
              db.get(`
                SELECT SUM(amount) / 3 as avgMonthly 
                FROM revenues 
                WHERE date >= ?
              `, [threeMonthsAgoStr], (err, result) => {
                if (err) {
                  console.error('[DASHBOARD] Erreur lors du calcul de la projection des revenus:', err);
                  console.error('[DASHBOARD] Stack trace:', err.stack);
                  // Continuer malgré l'erreur
                } else {
                  dashboardData.revenues.projection = result.avgMonthly || 0;
                  console.log(`[DASHBOARD] Projection des revenus: ${dashboardData.revenues.projection}`);
                }
                console.log('[DASHBOARD] Promesse de récupération des revenus résolue');
                resolve();
              });
            }
          });
        }
      });
    });
    
    // Récupérer les statistiques des activités
    console.log('[DASHBOARD] Début de la récupération des statistiques des activités');
    const activitiesPromise = new Promise((resolve, reject) => {
      console.log('[DASHBOARD] Exécution de la requête pour compter les activités par statut');
      db.all(`
        SELECT 
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) as pending
        FROM activities
      `, [], (err, results) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors du comptage des activités:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else if (results.length > 0) {
          const result = results[0];
          dashboardData.activities.completed = result.completed || 0;
          dashboardData.activities.pending = result.pending || 0;
          console.log(`[DASHBOARD] Statistiques des activités - Terminées: ${dashboardData.activities.completed}, En attente: ${dashboardData.activities.pending}`);
        } else {
          console.log('[DASHBOARD] Aucun résultat trouvé pour les statistiques des activités');
        }
        console.log('[DASHBOARD] Promesse de récupération des activités résolue');
        resolve();
      });
    });
    
    // Récupérer les statistiques des objectifs
    console.log('[DASHBOARD] Début de la récupération des statistiques des objectifs');
    const goalsPromise = new Promise((resolve, reject) => {
      // Calculer le pourcentage atteint pour chaque objectif
      console.log('[DASHBOARD] Exécution de la requête pour récupérer les objectifs en cours');
      db.all(`
        SELECT id, current_value, target_value
        FROM goals
        WHERE end_date >= date('now')
      `, [], (err, goals) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors de la récupération des objectifs:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else {
          console.log(`[DASHBOARD] Nombre d'objectifs récupérés: ${goals.length}`);
          let onTrack = 0;
          let atRisk = 0;
          
          goals.forEach(goal => {
            const progress = goal.current_value / goal.target_value;
            console.log(`[DASHBOARD] Objectif ID=${goal.id}: progression à ${(progress * 100).toFixed(2)}% (${goal.current_value}/${goal.target_value})`);
            // Si la progression est supérieure à 70%, considérer comme "sur la bonne voie"
            if (progress >= 0.7) {
              onTrack++;
              console.log(`[DASHBOARD] Objectif ID=${goal.id} est sur la bonne voie`);
            } else {
              atRisk++;
              console.log(`[DASHBOARD] Objectif ID=${goal.id} est à risque`);
            }
          });
          
          dashboardData.goals.onTrack = onTrack;
          dashboardData.goals.atRisk = atRisk;
          console.log(`[DASHBOARD] Statistiques des objectifs - Sur la bonne voie: ${dashboardData.goals.onTrack}, À risque: ${dashboardData.goals.atRisk}`);
        }
        console.log('[DASHBOARD] Promesse de récupération des objectifs résolue');
        resolve();
      });
    });
    
    // Récupérer les activités récentes
    console.log('[DASHBOARD] Début de la récupération des activités récentes');
    const recentActivitiesPromise = new Promise((resolve, reject) => {
      console.log('[DASHBOARD] Exécution de la requête pour récupérer les 5 dernières activités');
      db.all(`
        SELECT a.*, p.name as project_name
        FROM activities a
        LEFT JOIN projects p ON a.project_id = p.id
        ORDER BY a.date DESC
        LIMIT 5
      `, [], (err, activities) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors de la récupération des activités récentes:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else {
          dashboardData.recentActivities = activities || [];
          console.log(`[DASHBOARD] Nombre d'activités récentes récupérées: ${dashboardData.recentActivities.length}`);
          dashboardData.recentActivities.forEach((activity, index) => {
            console.log(`[DASHBOARD] Activité récente #${index + 1}: ID=${activity.id}, Projet=${activity.project_name}, Date=${activity.date}`);
          });
        }
        console.log('[DASHBOARD] Promesse de récupération des activités récentes résolue');
        resolve();
      });
    });
    
    // Récupérer la timeline des projets
    console.log('[DASHBOARD] Début de la récupération de la timeline des projets');
    const projectTimelinePromise = new Promise((resolve, reject) => {
      console.log('[DASHBOARD] Exécution de la requête pour récupérer la timeline des projets');
      db.all(`
        SELECT id, name, start_date, end_date, status
        FROM projects
        WHERE (status = 'in_progress' OR status = 'planned')
          AND start_date IS NOT NULL
          AND end_date IS NOT NULL
        ORDER BY start_date
        LIMIT 10
      `, [], (err, projects) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors de la récupération de la timeline des projets:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else {
          dashboardData.projectTimeline = projects || [];
          console.log(`[DASHBOARD] Nombre de projets dans la timeline: ${dashboardData.projectTimeline.length}`);
          dashboardData.projectTimeline.forEach((project, index) => {
            console.log(`[DASHBOARD] Projet timeline #${index + 1}: ID=${project.id}, Nom=${project.name}, Du ${project.start_date} au ${project.end_date}, Statut=${project.status}`);
          });
        }
        console.log('[DASHBOARD] Promesse de récupération de la timeline des projets résolue');
        resolve();
      });
    });
    
    // Récupérer les données du graphique des revenus (derniers 6 mois)
    console.log('[DASHBOARD] Début de la récupération des données du graphique des revenus');
    const revenueChartPromise = new Promise((resolve, reject) => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0].substring(0, 7);
      console.log(`[DASHBOARD] Date il y a six mois: ${sixMonthsAgoStr}`);
      
      console.log('[DASHBOARD] Exécution de la requête pour récupérer les données du graphique des revenus');
      db.all(`
        SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount
        FROM revenues
        WHERE strftime('%Y-%m', date) >= ?
        GROUP BY month
        ORDER BY month
      `, [sixMonthsAgoStr], (err, results) => {
        if (err) {
          console.error('[DASHBOARD] Erreur lors de la récupération des données du graphique des revenus:', err);
          console.error('[DASHBOARD] Stack trace:', err.stack);
          resolve(); // Continuer malgré l'erreur
        } else {
          dashboardData.revenueChart = results || [];
          console.log(`[DASHBOARD] Nombre de points de données pour le graphique des revenus: ${dashboardData.revenueChart.length}`);
          dashboardData.revenueChart.forEach((dataPoint, index) => {
            console.log(`[DASHBOARD] Revenus ${dataPoint.month}: ${dataPoint.amount}`);
          });
        }
        console.log('[DASHBOARD] Promesse de récupération des données du graphique des revenus résolue');
        resolve();
      });
    });
    
    console.log('[DASHBOARD] Attente de la résolution de toutes les promesses');
    // Attendre que toutes les requêtes soient terminées
    await Promise.all([
      leadsPromise,
      projectsPromise,
      revenuesPromise,
      activitiesPromise,
      goalsPromise,
      recentActivitiesPromise,
      projectTimelinePromise,
      revenueChartPromise
    ]);
    
    console.log('[DASHBOARD] Toutes les promesses ont été résolues');
    console.log('[DASHBOARD] Envoi des données du tableau de bord au client');
    
    // Intercept the response sending
    const oldJson = res.json;
    res.json = function(obj) {
      console.log(`[DASHBOARD] Réponse JSON envoyée avec statut ${res.statusCode}`);
      console.log(`[DASHBOARD] Taille de la réponse: environ ${JSON.stringify(obj).length} caractères`);
      return oldJson.apply(res, arguments);
    };
    
    res.json(dashboardData);
  } catch (error) {
    console.error('[DASHBOARD] Erreur lors de la récupération des données du tableau de bord:', error);
    console.error('[DASHBOARD] Stack trace complète:', error.stack);
    console.error(`[DASHBOARD] Type d'erreur: ${error.name}, Message: ${error.message}`);
    console.error(`[DASHBOARD] Informations système - Mémoire: ${process.memoryUsage().heapUsed / 1024 / 1024} MB`);
    console.error('[DASHBOARD] Envoi d\'une réponse d\'erreur au client');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Middleware de gestion des erreurs pour le routeur dashboard
router.use((err, req, res, next) => {
  console.error('[DASHBOARD] Erreur interceptée par le middleware d\'erreur:', err);
  console.error('[DASHBOARD] Stack trace:', err.stack);
  console.error(`[DASHBOARD] Requête qui a causé l'erreur: ${req.method} ${req.originalUrl}`);
  console.error(`[DASHBOARD] Corps de la requête: ${JSON.stringify(req.body)}`);
  console.error(`[DASHBOARD] Paramètres de la requête: ${JSON.stringify(req.params)}`);
  console.error(`[DASHBOARD] Query string: ${JSON.stringify(req.query)}`);
  res.status(500).json({ 
    message: 'Erreur serveur dans le module dashboard', 
    errorId: Date.now() 
  });
});

console.log('[DASHBOARD] Configuration des routes du tableau de bord terminée');

module.exports = router;