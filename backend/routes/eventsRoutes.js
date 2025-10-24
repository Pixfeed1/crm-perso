// backend/routes/eventsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les événements
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  
  // Paramètres de filtrage par date (optionnels)
  const { start_date, end_date } = req.query;
  let query = 'SELECT * FROM events';
  let params = [];
  
  // Ajouter des filtres de date si spécifiés
  if (start_date && end_date) {
    query += ' WHERE start_datetime >= ? AND end_datetime <= ?';
    params = [start_date, end_date];
  } else if (start_date) {
    query += ' WHERE start_datetime >= ?';
    params = [start_date];
  } else if (end_date) {
    query += ' WHERE end_datetime <= ?';
    params = [end_date];
  }
  
  query += ' ORDER BY start_datetime ASC';
  
  db.all(query, params, (err, events) => {
    if (err) {
      console.error('Erreur lors de la récupération des événements:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    res.json(events);
  });
});

// Obtenir un événement spécifique
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  db.get('SELECT * FROM events WHERE id = ?', [id], (err, event) => {
    if (err) {
      console.error('Erreur lors de la récupération de l\'événement:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    res.json(event);
  });
});

// Créer un nouvel événement
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { 
    title, 
    description, 
    start_datetime, 
    end_datetime, 
    all_day, 
    location,
    category,
    priority,
    color,
    reminder_time,
    activity_id
  } = req.body;
  
  if (!title || !start_datetime) {
    return res.status(400).json({ message: 'Titre et date de début sont requis' });
  }
  
  const query = `
    INSERT INTO events (
      title, description, start_datetime, end_datetime, all_day, 
      location, category, priority, color, reminder_time, activity_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const now = new Date().toISOString();
  
  db.run(query, [
    title,
    description || null,
    start_datetime,
    end_datetime || start_datetime, // Si pas de date de fin, utiliser la date de début
    all_day ? 1 : 0,
    location || null,
    category || null,
    priority || null,
    color || null,
    reminder_time || null,
    activity_id || null,
    now
  ], function(err) {
    if (err) {
      console.error('Erreur lors de la création de l\'événement:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    const newEventId = this.lastID;
    
    // Récupérer l'événement créé
    db.get('SELECT * FROM events WHERE id = ?', [newEventId], (err, event) => {
      if (err) {
        console.error('Erreur lors de la récupération de l\'événement créé:', err);
        return res.status(201).json({ id: newEventId, message: 'Événement créé' });
      }
      
      res.status(201).json(event);
    });
  });
});

// Mettre à jour un événement
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { 
    title, 
    description, 
    start_datetime, 
    end_datetime, 
    all_day, 
    location,
    category,
    priority,
    color,
    reminder_time,
    activity_id
  } = req.body;
  
  // Vérifier si l'événement existe
  db.get('SELECT * FROM events WHERE id = ?', [id], (err, event) => {
    if (err) {
      console.error('Erreur lors de la vérification de l\'événement:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    // Construire la requête de mise à jour
    const updates = [];
    const params = [];
    
    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    
    if (start_datetime !== undefined) {
      updates.push('start_datetime = ?');
      params.push(start_datetime);
    }
    
    if (end_datetime !== undefined) {
      updates.push('end_datetime = ?');
      params.push(end_datetime);
    }
    
    if (all_day !== undefined) {
      updates.push('all_day = ?');
      params.push(all_day ? 1 : 0);
    }
    
    if (location !== undefined) {
      updates.push('location = ?');
      params.push(location);
    }
    
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }
    
    if (reminder_time !== undefined) {
      updates.push('reminder_time = ?');
      params.push(reminder_time);
    }
    
    if (activity_id !== undefined) {
      updates.push('activity_id = ?');
      params.push(activity_id);
    }
    
    // Ajouter l'ID pour la clause WHERE
    params.push(id);
    
    const query = `
      UPDATE events
      SET ${updates.join(', ')}
      WHERE id = ?
    `;
    
    db.run(query, params, function(err) {
      if (err) {
        console.error('Erreur lors de la mise à jour de l\'événement:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      // Récupérer l'événement mis à jour
      db.get('SELECT * FROM events WHERE id = ?', [id], (err, updatedEvent) => {
        if (err) {
          console.error('Erreur lors de la récupération de l\'événement mis à jour:', err);
          return res.status(200).json({ id, message: 'Événement mis à jour' });
        }
        
        res.json(updatedEvent);
      });
    });
  });
});

// Supprimer un événement
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  
  // Vérifier si l'événement existe
  db.get('SELECT * FROM events WHERE id = ?', [id], (err, event) => {
    if (err) {
      console.error('Erreur lors de la vérification de l\'événement:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    // Supprimer l'événement
    db.run('DELETE FROM events WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression de l\'événement:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }
      
      res.json({ message: 'Événement supprimé avec succès' });
    });
  });
});

// Obtenir les événements pour une période spécifique
router.get('/range/:start/:end', (req, res) => {
  const db = req.app.locals.db;
  const { start, end } = req.params;
  
  if (!start || !end) {
    return res.status(400).json({ message: 'Les dates de début et de fin sont requises' });
  }
  
  const query = `
    SELECT * FROM events 
    WHERE (start_datetime >= ? AND start_datetime <= ?) 
       OR (end_datetime >= ? AND end_datetime <= ?)
       OR (start_datetime <= ? AND end_datetime >= ?)
    ORDER BY start_datetime ASC
  `;
  
  db.all(query, [start, end, start, end, start, end], (err, events) => {
    if (err) {
      console.error('Erreur lors de la récupération des événements par période:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
    
    res.json(events);
  });
});

module.exports = router;