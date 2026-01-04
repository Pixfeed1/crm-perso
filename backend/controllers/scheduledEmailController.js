// backend/controllers/scheduledEmailController.js

const scheduledEmailModel = require('../models/scheduledEmailModel');

/**
 * CONTRÔLEUR DES EMAILS PROGRAMMÉS
 *
 * Gère les endpoints API pour :
 * - Création d'emails programmés
 * - Consultation et modification
 * - Annulation
 * - Statistiques
 */

/**
 * POST /api/scheduled-emails
 * Crée un nouvel email programmé
 */
const createScheduledEmail = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const emailData = {
      ...req.body,
      created_by: req.user?.id || null
    };

    // Validation basique
    if (!emailData.to_email) {
      return res.status(400).json({ message: 'Email destinataire requis' });
    }
    if (!emailData.subject) {
      return res.status(400).json({ message: 'Sujet requis' });
    }
    if (!emailData.body_html) {
      return res.status(400).json({ message: 'Corps de l\'email requis' });
    }
    if (!emailData.scheduled_at) {
      return res.status(400).json({ message: 'Date de programmation requise' });
    }

    // Vérifier que la date est dans le futur
    const scheduledDate = new Date(emailData.scheduled_at);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ message: 'La date de programmation doit être dans le futur' });
    }

    const email = await scheduledEmailModel.createScheduledEmail(db, emailData);

    res.status(201).json({
      message: 'Email programmé avec succès',
      email
    });
  } catch (error) {
    console.error('Erreur createScheduledEmail:', error);
    res.status(500).json({
      message: 'Erreur lors de la programmation de l\'email',
      error: error.message
    });
  }
};

/**
 * GET /api/scheduled-emails
 * Liste tous les emails programmés avec filtres
 */
const getAllScheduledEmails = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { status, email_type, related_type, related_id, limit = 50, offset = 0 } = req.query;

    const result = await scheduledEmailModel.getAllScheduledEmails(db, {
      status,
      email_type,
      related_type,
      related_id: related_id ? parseInt(related_id) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur getAllScheduledEmails:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des emails',
      error: error.message
    });
  }
};

/**
 * GET /api/scheduled-emails/stats
 * Récupère les statistiques des emails programmés
 */
const getStats = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const stats = await scheduledEmailModel.getScheduledEmailStats(db);
    res.json(stats);
  } catch (error) {
    console.error('Erreur getStats:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
};

/**
 * GET /api/scheduled-emails/upcoming
 * Récupère les prochains emails à envoyer
 */
const getUpcoming = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = parseInt(req.query.limit) || 10;
    const emails = await scheduledEmailModel.getUpcomingEmails(db, limit);
    res.json(emails);
  } catch (error) {
    console.error('Erreur getUpcoming:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des emails',
      error: error.message
    });
  }
};

/**
 * GET /api/scheduled-emails/:id
 * Récupère un email programmé par ID
 */
const getScheduledEmailById = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const email = await scheduledEmailModel.getScheduledEmailById(db, parseInt(id));

    if (!email) {
      return res.status(404).json({ message: 'Email non trouvé' });
    }

    res.json(email);
  } catch (error) {
    console.error('Erreur getScheduledEmailById:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération de l\'email',
      error: error.message
    });
  }
};

/**
 * PUT /api/scheduled-emails/:id
 * Met à jour un email programmé (avant envoi uniquement)
 */
const updateScheduledEmail = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const updates = req.body;

    // Vérifier la date si modifiée
    if (updates.scheduled_at) {
      const scheduledDate = new Date(updates.scheduled_at);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ message: 'La date de programmation doit être dans le futur' });
      }
    }

    const email = await scheduledEmailModel.updateScheduledEmail(db, parseInt(id), updates);

    res.json({
      message: 'Email mis à jour avec succès',
      email
    });
  } catch (error) {
    console.error('Erreur updateScheduledEmail:', error);
    res.status(500).json({
      message: 'Erreur lors de la mise à jour de l\'email',
      error: error.message
    });
  }
};

/**
 * POST /api/scheduled-emails/:id/cancel
 * Annule un email programmé
 */
const cancelScheduledEmail = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const email = await scheduledEmailModel.cancelScheduledEmail(db, parseInt(id));

    res.json({
      message: 'Email annulé avec succès',
      email
    });
  } catch (error) {
    console.error('Erreur cancelScheduledEmail:', error);
    res.status(500).json({
      message: 'Erreur lors de l\'annulation de l\'email',
      error: error.message
    });
  }
};

/**
 * DELETE /api/scheduled-emails/:id
 * Supprime un email programmé (pending ou cancelled uniquement)
 */
const deleteScheduledEmail = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    const deleted = await scheduledEmailModel.deleteScheduledEmail(db, parseInt(id));

    if (!deleted) {
      return res.status(400).json({
        message: 'Impossible de supprimer cet email (déjà envoyé ou inexistant)'
      });
    }

    res.json({ message: 'Email supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteScheduledEmail:', error);
    res.status(500).json({
      message: 'Erreur lors de la suppression de l\'email',
      error: error.message
    });
  }
};

/**
 * GET /api/scheduled-emails/related/:type/:id
 * Récupère les emails programmés pour un élément lié
 */
const getByRelated = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { type, id } = req.params;

    const emails = await scheduledEmailModel.getScheduledEmailsByRelated(
      db, type, parseInt(id)
    );

    res.json(emails);
  } catch (error) {
    console.error('Erreur getByRelated:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des emails',
      error: error.message
    });
  }
};

module.exports = {
  createScheduledEmail,
  getAllScheduledEmails,
  getStats,
  getUpcoming,
  getScheduledEmailById,
  updateScheduledEmail,
  cancelScheduledEmail,
  deleteScheduledEmail,
  getByRelated
};
