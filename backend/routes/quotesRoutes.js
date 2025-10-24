// backend/routes/quotesRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionsMiddleware');
const quoteModel = require('../models/quoteModel');
const projectModel = require('../models/projectModel');
const leadModel = require('../models/leadModel');
const { generateQuotePDF } = require('../utils/quotePdfGenerator');

// Appliquer le middleware d'authentification
router.use(authMiddleware);

/**
 * GET /api/quotes
 * Obtenir tous les devis de l'utilisateur
 */
router.get('/', requirePermission('read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const quotes = await quoteModel.getAllQuotes(userId);
    res.json(quotes);
  } catch (error) {
    console.error('Erreur lors de la récupération des devis:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * GET /api/quotes/:id
 * Obtenir un devis spécifique avec ses lignes
 */
router.get('/:id', requirePermission('read'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const quote = await quoteModel.getQuoteById(id, userId);

    if (!quote) {
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    res.json(quote);
  } catch (error) {
    console.error('Erreur lors de la récupération du devis:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/quotes
 * Créer un nouveau devis
 */
router.post('/', requirePermission('create'), async (req, res) => {
  try {
    const userId = req.user.id;
    const quoteData = req.body;

    // Validation
    if (!quoteData.title || !quoteData.items || quoteData.items.length === 0) {
      return res.status(400).json({
        message: 'Le titre et au moins une ligne sont requis'
      });
    }

    const newQuote = await quoteModel.createQuote(userId, quoteData);
    res.status(201).json(newQuote);
  } catch (error) {
    console.error('Erreur lors de la création du devis:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * PUT /api/quotes/:id
 * Mettre à jour un devis
 */
router.put('/:id', requirePermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const quoteData = req.body;

    const updatedQuote = await quoteModel.updateQuote(id, userId, quoteData);
    res.json(updatedQuote);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du devis:', error);
    if (error.message === 'Devis non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * DELETE /api/quotes/:id
 * Supprimer un devis
 */
router.delete('/:id', requirePermission('delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await quoteModel.deleteQuote(id, userId);
    res.json({ message: 'Devis supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du devis:', error);
    if (error.message === 'Devis non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/quotes/:id/send
 * Marquer un devis comme envoyé
 */
router.post('/:id/send', requirePermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const updatedQuote = await quoteModel.updateQuoteStatus(id, userId, 'sent');
    res.json(updatedQuote);
  } catch (error) {
    console.error('Erreur lors de l\'envoi du devis:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/quotes/:id/accept
 * Accepter un devis
 */
router.post('/:id/accept', requirePermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const updatedQuote = await quoteModel.updateQuoteStatus(id, userId, 'accepted');
    res.json(updatedQuote);
  } catch (error) {
    console.error('Erreur lors de l\'acceptation du devis:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/quotes/:id/reject
 * Rejeter un devis
 */
router.post('/:id/reject', requirePermission('update'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const updatedQuote = await quoteModel.updateQuoteStatus(id, userId, 'rejected');
    res.json(updatedQuote);
  } catch (error) {
    console.error('Erreur lors du rejet du devis:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * GET /api/quotes/:id/pdf
 * Générer et télécharger le PDF d'un devis
 */
router.get('/:id/pdf', requirePermission('read'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Récupérer le devis
    const quote = await quoteModel.getQuoteById(id, userId);

    if (!quote) {
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    // Générer le PDF
    const pdfBuffer = await generateQuotePDF(quote);

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${quote.quote_number}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Erreur lors de la génération du PDF:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /api/quotes/:id/convert-to-project
 * Convertir un devis accepté en projet
 */
router.post('/:id/convert-to-project', requirePermission('create'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Récupérer le devis
    const quote = await quoteModel.getQuoteById(id, userId);

    if (!quote) {
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    // Vérifier que le devis est accepté
    if (quote.status !== 'accepted') {
      return res.status(400).json({
        message: 'Seul un devis accepté peut être converti en projet'
      });
    }

    // Créer le projet
    const projectData = {
      name: quote.title,
      type: 'autre',
      description: `Projet créé depuis le devis ${quote.quote_number}`,
      status: 'planned',
      amount: quote.total_amount,
      lead_id: quote.lead_id,
      start_date: new Date().toISOString().split('T')[0]
    };

    const newProject = await projectModel.createProject(userId, projectData);

    // Si le devis est lié à un lead, marquer le lead comme converti
    if (quote.lead_id) {
      try {
        await leadModel.markAsConverted(quote.lead_id, newProject.id);
      } catch (err) {
        console.error('Erreur lors de la mise à jour du lead:', err);
        // Ne pas échouer la conversion si la mise à jour du lead échoue
      }
    }

    // Marquer le devis comme converti
    await quoteModel.updateQuoteStatus(id, userId, 'converted', { skipSentAt: true });

    res.json({
      message: 'Devis converti en projet avec succès',
      project: newProject,
      quote_id: id
    });
  } catch (error) {
    console.error('Erreur lors de la conversion en projet:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
