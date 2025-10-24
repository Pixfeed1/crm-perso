// backend/controllers/searchController.js

const leadModel = require('../models/leadModel');
const projectModel = require('../models/projectModel');
const goalModel = require('../models/goalModel');
const activityModel = require('../models/activityModel');

/**
 * Recherche globale dans toutes les entités
 */
const globalSearch = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.json({
        leads: [],
        projects: [],
        goals: [],
        activities: [],
        contacts: []
      });
    }

    const searchTerm = `%${query.toLowerCase()}%`;

    // Recherche dans les leads
    const leadsPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, company, status, type
         FROM leads
         WHERE LOWER(name) LIKE ? OR LOWER(company) LIKE ? OR LOWER(email) LIKE ?
         LIMIT 10`,
        [searchTerm, searchTerm, searchTerm],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Recherche dans les projets
    const projectsPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, status, start_date, end_date
         FROM projects
         WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?
         LIMIT 10`,
        [searchTerm, searchTerm],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Recherche dans les objectifs
    const goalsPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, category, current_value, target_value
         FROM goals
         WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?
         LIMIT 10`,
        [searchTerm, searchTerm, searchTerm],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Recherche dans les activités
    const activitiesPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT id, description, type, date, status
         FROM activities
         WHERE LOWER(description) LIKE ? OR LOWER(type) LIKE ?
         ORDER BY date DESC
         LIMIT 10`,
        [searchTerm, searchTerm],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Recherche dans les contacts
    const contactsPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT c.id, c.name, c.email, c.position, c.lead_id, l.name as lead_name
         FROM contacts c
         LEFT JOIN leads l ON c.lead_id = l.id
         WHERE LOWER(c.name) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.position) LIKE ?
         LIMIT 10`,
        [searchTerm, searchTerm, searchTerm],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Exécuter toutes les recherches en parallèle
    const [leads, projects, goals, activities, contacts] = await Promise.all([
      leadsPromise,
      projectsPromise,
      goalsPromise,
      activitiesPromise,
      contactsPromise
    ]);

    res.json({
      leads,
      projects,
      goals,
      activities,
      contacts,
      total: leads.length + projects.length + goals.length + activities.length + contacts.length
    });
  } catch (error) {
    console.error('Erreur lors de la recherche globale:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

module.exports = {
  globalSearch
};
