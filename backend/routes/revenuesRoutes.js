// backend/routes/revenuesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les revenus
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  
  // Paramètres de filtrage (optionnels)
  const { start_date, end_date, type, project_id } = req.query;
  let query = `
    SELECT r.*, p.name as project_name 
    FROM revenues r
    LEFT JOIN projects p ON r.project_id = p.id
  `;
  let params = [];
  let conditions = [];
  
  // Ajouter des filtres si spécifiés
  if (start_date) {
    conditions.push('r.date >= ?');
    params.push(start_date);
  }
  
  if (end_date) {
    conditions.push('r.date <= ?');
    params.push(end_date);
  }
  
  if (type) {
    conditions.push('r.type = ?');
    params.push(type);
  }
  
  if (project_id) {
    conditions.push('r.project_id = ?');
    params.push(project_id);
  }
  
  // Appliquer les conditions si elles existent
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY r.date DESC';
  
  db.all(query, params, (err, revenues) => {
    if (err) {
      console.error('Erreur lors de la récupération des revenus:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    res.json(revenues);
  });
});

// Obtenir un revenu spécifique
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  const query = `
    SELECT r.*, p.name as project_name 
    FROM revenues r
    LEFT JOIN projects p ON r.project_id = p.id
    WHERE r.id = ?
  `;
  
  db.get(query, [id], (err, revenue) => {
    if (err) {
      console.error('Erreur lors de la récupération du revenu:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!revenue) {
      return res.status(404).json({ message: 'Revenu non trouvé' });
    }
    
    res.json(revenue);
  });
});

// Créer un nouveau revenu
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { amount, date, description, project_id, type } = req.body;
  
  if (!amount || !date || !type) {
    return res.status(400).json({ message: 'Montant, date et type sont requis' });
  }
  
  const query = `
    INSERT INTO revenues (amount, date, description, project_id, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  const now = new Date().toISOString();
  
  db.run(query, [
    amount,
    date,
    description || null,
    project_id || null,
    type,
    now
  ], function(err) {
    if (err) {
      console.error('Erreur lors de la création du revenu:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    const newRevenueId = this.lastID;
    
    // Récupérer le revenu créé
    const getQuery = `
      SELECT r.*, p.name as project_name 
      FROM revenues r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE r.id = ?
    `;
    
    db.get(getQuery, [newRevenueId], (err, revenue) => {
      if (err) {
        console.error('Erreur lors de la récupération du nouveau revenu:', err);
        return res.status(201).json({ id: newRevenueId, message: 'Revenu créé' });
      }
      
      res.status(201).json(revenue);
    });
  });
});

// Mettre à jour un revenu
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { amount, date, description, project_id, type } = req.body;
  
  // Vérifier si le revenu existe
  db.get('SELECT * FROM revenues WHERE id = ?', [id], (err, revenue) => {
    if (err) {
      console.error('Erreur lors de la vérification du revenu:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!revenue) {
      return res.status(404).json({ message: 'Revenu non trouvé' });
    }
    
    // Construire la requête de mise à jour
    const updates = [];
    const params = [];
    
    if (amount !== undefined) {
      updates.push('amount = ?');
      params.push(amount);
    }
    
    if (date !== undefined) {
      updates.push('date = ?');
      params.push(date);
    }
    
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    
    if (project_id !== undefined) {
      updates.push('project_id = ?');
      params.push(project_id);
    }
    
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    
    // Ajouter l'ID pour la clause WHERE
    params.push(id);
    
    const query = `
      UPDATE revenues
      SET ${updates.join(', ')}
      WHERE id = ?
    `;
    
    db.run(query, params, function(err) {
      if (err) {
        console.error('Erreur lors de la mise à jour du revenu:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      // Récupérer le revenu mis à jour
      const getQuery = `
        SELECT r.*, p.name as project_name 
        FROM revenues r
        LEFT JOIN projects p ON r.project_id = p.id
        WHERE r.id = ?
      `;
      
      db.get(getQuery, [id], (err, updatedRevenue) => {
        if (err) {
          console.error('Erreur lors de la récupération du revenu mis à jour:', err);
          return res.status(200).json({ id, message: 'Revenu mis à jour' });
        }
        
        res.json(updatedRevenue);
      });
    });
  });
});

// Supprimer un revenu
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  // Vérifier si le revenu existe
  db.get('SELECT * FROM revenues WHERE id = ?', [id], (err, revenue) => {
    if (err) {
      console.error('Erreur lors de la vérification du revenu:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!revenue) {
      return res.status(404).json({ message: 'Revenu non trouvé' });
    }
    
    // Supprimer le revenu
    db.run('DELETE FROM revenues WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression du revenu:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      res.json({ message: 'Revenu supprimé avec succès' });
    });
  });
});

// Obtenir les statistiques des revenus
router.get('/stats/summary', (req, res) => {
  const db = req.app.locals.db;
  const { period } = req.query;
  
  let timeFilter = '';
  let params = [];
  
  // Déterminer le filtre de temps en fonction de la période
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  if (period === 'month') {
    // Filtrer pour le mois en cours
    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const endOfMonth = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
    
    timeFilter = 'WHERE date >= ? AND date <= ?';
    params = [startOfMonth, endOfMonth];
  } else if (period === 'year') {
    // Filtrer pour l'année en cours
    const startOfYear = `${currentYear}-01-01`;
    const endOfYear = `${currentYear}-12-31`;
    
    timeFilter = 'WHERE date >= ? AND date <= ?';
    params = [startOfYear, endOfYear];
  } else if (period === 'quarter') {
    // Déterminer le trimestre en cours
    const quarterStartMonth = Math.floor((currentMonth - 1) / 3) * 3 + 1;
    const quarterEndMonth = quarterStartMonth + 2;
    
    const startOfQuarter = `${currentYear}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    const endOfQuarter = new Date(currentYear, quarterEndMonth, 0).toISOString().split('T')[0];
    
    timeFilter = 'WHERE date >= ? AND date <= ?';
    params = [startOfQuarter, endOfQuarter];
  }
  
  // Statistiques à récupérer
  const stats = {
    total: 0,
    by_type: {},
    by_project: {},
    trend: []
  };
  
  // 1. Récupérer le total
  db.get(`SELECT SUM(amount) as total FROM revenues ${timeFilter}`, params, (err, result) => {
    if (err) {
      console.error('Erreur lors du calcul du total des revenus:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    stats.total = result.total || 0;
    
    // 2. Récupérer les revenus par type
    db.all(`
      SELECT type, SUM(amount) as amount
      FROM revenues
      ${timeFilter}
      GROUP BY type
      ORDER BY amount DESC
    `, params, (err, typeResults) => {
      if (err) {
        console.error('Erreur lors du calcul des revenus par type:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      typeResults.forEach(item => {
        stats.by_type[item.type] = item.amount;
      });
      
      // 3. Récupérer les revenus par projet
      db.all(`
        SELECT r.project_id, p.name as project_name, SUM(r.amount) as amount
        FROM revenues r
        LEFT JOIN projects p ON r.project_id = p.id
        ${timeFilter}
        GROUP BY r.project_id
        ORDER BY amount DESC
      `, params, (err, projectResults) => {
        if (err) {
          console.error('Erreur lors du calcul des revenus par projet:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }
        
        projectResults.forEach(item => {
          const projectName = item.project_name || 'Sans projet';
          stats.by_project[projectName] = item.amount;
        });
        
        // 4. Récupérer la tendance (derniers 6 mois)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0].substring(0, 7);
        
        db.all(`
          SELECT strftime('%Y-%m', date) as month, SUM(amount) as amount
          FROM revenues
          WHERE strftime('%Y-%m', date) >= ?
          GROUP BY month
          ORDER BY month
        `, [sixMonthsAgoStr], (err, trendResults) => {
          if (err) {
            console.error('Erreur lors du calcul de la tendance des revenus:', err);
            return res.status(500).json({ message: 'Erreur serveur' });
          }
          
          stats.trend = trendResults.map(item => ({
            month: item.month,
            amount: item.amount
          }));
          
          res.json(stats);
        });
      });
    });
  });
});

module.exports = router;