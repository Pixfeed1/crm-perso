// backend/routes/searchRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../config/pgConfig');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

/**
 * Route de recherche globale
 * GET /api/search?q=terme
 * Recherche dans tous les modules: leads, projets, activités, objectifs, revenus
 */
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;

    // Validation du terme de recherche
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        message: 'Le terme de recherche doit contenir au moins 2 caractères',
        results: {
          leads: [],
          projects: [],
          activities: [],
          goals: [],
          revenues: []
        }
      });
    }

    const searchTerm = `%${q.toLowerCase()}%`;

    // Recherche parallèle dans tous les modules
    const [leads, projects, activities, goals, revenues] = await Promise.all([
      searchLeads(userId, searchTerm),
      searchProjects(userId, searchTerm),
      searchActivities(userId, searchTerm),
      searchGoals(userId, searchTerm),
      searchRevenues(userId, searchTerm)
    ]);

    // Compter les résultats totaux
    const totalResults = leads.length + projects.length + activities.length + goals.length + revenues.length;

    res.json({
      query: q,
      totalResults,
      leads,
      projects,
      activities,
      goals,
      revenues
    });

  } catch (error) {
    console.error('Erreur lors de la recherche globale:', error);
    res.status(500).json({
      message: 'Erreur lors de la recherche',
      error: error.message
    });
  }
});

/**
 * Rechercher dans les leads
 */
async function searchLeads(userId, searchTerm) {
  const query = `
    SELECT
      id,
      name,
      email,
      phone,
      company,
      status,
      created_at
    FROM leads
    WHERE user_id = $1
      AND (
        LOWER(name) LIKE $2
        OR LOWER(email) LIKE $2
        OR LOWER(company) LIKE $2
        OR LOWER(phone) LIKE $2
      )
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const result = await db.query(query, [userId, searchTerm]);
  return result.rows;
}

/**
 * Rechercher dans les projets
 */
async function searchProjects(userId, searchTerm) {
  const query = `
    SELECT
      id,
      name,
      description,
      status,
      budget,
      start_date,
      end_date,
      created_at
    FROM projects
    WHERE user_id = $1
      AND (
        LOWER(name) LIKE $2
        OR LOWER(description) LIKE $2
        OR LOWER(status) LIKE $2
      )
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const result = await db.query(query, [userId, searchTerm]);
  return result.rows;
}

/**
 * Rechercher dans les activités
 */
async function searchActivities(userId, searchTerm) {
  const query = `
    SELECT
      id,
      title,
      description,
      activity_type,
      status,
      due_date,
      priority,
      created_at
    FROM activities
    WHERE user_id = $1
      AND (
        LOWER(title) LIKE $2
        OR LOWER(description) LIKE $2
        OR LOWER(activity_type) LIKE $2
      )
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const result = await db.query(query, [userId, searchTerm]);
  return result.rows;
}

/**
 * Rechercher dans les objectifs
 */
async function searchGoals(userId, searchTerm) {
  const query = `
    SELECT
      id,
      name,
      description,
      target_value,
      current_value,
      metric_unit,
      status,
      start_date,
      end_date,
      created_at
    FROM goals
    WHERE user_id = $1
      AND (
        LOWER(name) LIKE $2
        OR LOWER(description) LIKE $2
        OR LOWER(metric_unit) LIKE $2
      )
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const result = await db.query(query, [userId, searchTerm]);
  return result.rows;
}

/**
 * Rechercher dans les revenus
 */
async function searchRevenues(userId, searchTerm) {
  const query = `
    SELECT
      id,
      amount,
      description,
      source,
      status,
      date,
      payment_method,
      created_at
    FROM revenues
    WHERE user_id = $1
      AND (
        LOWER(description) LIKE $2
        OR LOWER(source) LIKE $2
        OR LOWER(payment_method) LIKE $2
        OR CAST(amount AS TEXT) LIKE $2
      )
    ORDER BY date DESC
    LIMIT 10
  `;

  const result = await db.query(query, [userId, searchTerm]);
  return result.rows;
}

module.exports = router;
