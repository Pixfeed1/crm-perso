// backend/controllers/dashboardController.js

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
      
      // Récupérer les statistiques des leads
      const leadsPromise = new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as total FROM leads', [], (err, result) => {
          if (err) {
            console.error('Erreur lors du comptage des leads:', err);
            resolve(); // Continuer malgré l'erreur
          } else {
            dashboardData.leads.total = result.total || 0;
            
            // Compter les nouveaux leads du mois
            db.get(`
              SELECT COUNT(*) as newLeads 
              FROM leads 
              WHERE created_at >= ?
            `, [startOfMonth], (err, result) => {
              if (err) {
                console.error('Erreur lors du comptage des nouveaux leads:', err);
                // Continuer malgré l'erreur
              } else {
                dashboardData.leads.newThisMonth = result.newLeads || 0;
              }
              resolve();
            });
          }
        });
      });
      
      // Récupérer les statistiques des projets
      const projectsPromise = new Promise((resolve, reject) => {
        db.all(`
          SELECT 
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'planned' AND start_date > date('now') THEN 1 ELSE 0 END) as upcoming
          FROM projects
        `, [], (err, results) => {
          if (err) {
            console.error('Erreur lors du comptage des projets:', err);
            resolve(); // Continuer malgré l'erreur
          } else if (results.length > 0) {
            const result = results[0];
            dashboardData.projects.active = result.active || 0;
            dashboardData.projects.completed = result.completed || 0;
            dashboardData.projects.upcoming = result.upcoming || 0;
          }
          resolve();
        });
      });
      
      // Récupérer les statistiques des revenus
      const revenuesPromise = new Promise((resolve, reject) => {
        // Revenus du mois en cours
        db.get(`
          SELECT SUM(amount) as monthTotal 
          FROM revenues 
          WHERE date >= ?
        `, [startOfMonth], (err, result) => {
          if (err) {
            console.error('Erreur lors du calcul des revenus du mois:', err);
            resolve(); // Continuer malgré l'erreur
          } else {
            dashboardData.revenues.thisMonth = result.monthTotal || 0;
            
            // Revenus totaux
            db.get('SELECT SUM(amount) as total FROM revenues', [], (err, result) => {
              if (err) {
                console.error('Erreur lors du calcul des revenus totaux:', err);
                // Continuer malgré l'erreur
              } else {
                dashboardData.revenues.total = result.total || 0;
                
                // Projection basée sur la moyenne des 3 derniers mois
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];
                
                db.get(`
                  SELECT SUM(amount) / 3 as avgMonthly 
                  FROM revenues 
                  WHERE date >= ?
                `, [threeMonthsAgoStr], (err, result) => {
                  if (err) {
                    console.error('Erreur lors du calcul de la projection des revenus:', err);
                    // Continuer malgré l'erreur
                  } else {
                    dashboardData.revenues.projection = result.avgMonthly || 0;
                  }
                  resolve();
                });
              }
            });
          }
        });
      });
      
      // Récupérer les statistiques des activités
      const activitiesPromise = new Promise((resolve, reject) => {
        db.all(`
          SELECT 
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) as pending
          FROM activities
        `, [], (err, results) => {
          if (err) {
            console.error('Erreur lors du comptage des activités:', err);
            resolve(); // Continuer malgré l'erreur
          } else if (results.length > 0) {
            const result = results[0];
            dashboardData.activities.completed = result.completed || 0;
            dashboardData.activities.pending = result.pending || 0;
          }
          resolve();
        });
      });
      
      // Récupérer les statistiques des objectifs
      const goalsPromise = new Promise((resolve, reject) => {
        // Calculer le pourcentage atteint pour chaque objectif
        db.all(`
          SELECT id, current_value, target_value
          FROM goals
          WHERE end_date >= date('now')
        `, [], (err, goals) => {
          if (err) {
            console.error('Erreur lors de la récupération des objectifs:', err);
            resolve(); // Continuer malgré l'erreur
          } else {
            let onTrack = 0;
            let atRisk = 0;
            
            goals.forEach(goal => {
              const progress = goal.current_value / goal.target_value;
              // Si la progression est supérieure à 70%, considérer comme "sur la bonne voie"
              if (progress >= 0.7) {
                onTrack++;
              } else {
                atRisk++;
              }
            });
            
            dashboardData.goals.onTrack = onTrack;
            dashboardData.goals.atRisk = atRisk;
          }
          resolve();
        });
      });
      
      // Récupérer les activités récentes
      const recentActivitiesPromise = new Promise((resolve, reject) => {
        db.all(`
          SELECT a.*, p.name as project_name
          FROM activities a
          LEFT JOIN projects p ON a.project_id = p.id
          ORDER BY a.date DESC
          LIMIT 5
        `, [], (err, activities) => {
          if (err) {
            console.error('Erreur lors de la récupération des activités récentes:', err);
            resolve(); // Continuer malgré l'erreur
          } else {
            dashboardData.recentActivities = activities || [];
          }
          resolve();
        });
      });
      
      // Récupérer la timeline des projets
      const projectTimelinePromise = new Promise((resolve, reject) => {
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
            console.error('Erreur lors de la récupération de la timeline des projets:', err);
            resolve(); // Continuer malgré l'erreur
          } else {
            dashboardData.projectTimeline = projects || [];
          }
          resolve();
        });
      });
      
      // Récupérer les données du graphique des revenus (derniers 6 mois)
      const revenueChartPromise = new Promise((resolve, reject) => {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0].substring(0, 7);
        
        db.all(`
          SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount
          FROM revenues
          WHERE strftime('%Y-%m', date) >= ?
          GROUP BY month
          ORDER BY month
        `, [sixMonthsAgoStr], (err, results) => {
          if (err) {
            console.error('Erreur lors de la récupération des données du graphique des revenus:', err);
            resolve(); // Continuer malgré l'erreur
          } else {
            dashboardData.revenueChart = results || [];
          }
          resolve();
        });
      });
      
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
      
      res.json(dashboardData);
    } catch (error) {
      console.error('Erreur lors de la récupération des données du tableau de bord:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = dashboardController;