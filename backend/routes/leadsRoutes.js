// backend/routes/leadsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const leadModel = require('../models/leadModel');
const contactModel = require('../models/contactModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les leads
router.get('/', async (req, res) => {
  try {
    const leads = await leadModel.getAllLeads();
    res.json(leads);
  } catch (error) {
    console.error('Erreur lors de la récupération des leads:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Obtenir un lead spécifique avec ses contacts et projets
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await leadModel.getLeadById(id);

    if (!lead) {
      return res.status(404).json({ message: 'Lead non trouvé' });
    }

    res.json(lead);
  } catch (error) {
    console.error('Erreur lors de la récupération du lead:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Créer un nouveau lead
router.post('/', async (req, res) => {
  try {
    const lead = await leadModel.createLead(req.body);
    res.status(201).json(lead);
  } catch (error) {
    console.error('Erreur lors de la création du lead:', error);
    if (error.message.includes('requis')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour un lead
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await leadModel.updateLead(id, req.body);
    res.json(lead);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du lead:', error);
    if (error.message === 'Lead non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Supprimer un lead
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await leadModel.deleteLead(id);
    res.json({ message: 'Lead supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du lead:', error);
    if (error.message === 'Lead non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// ==================== Routes pour les contacts ====================

// Obtenir tous les contacts d'un lead
router.get('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const contacts = await contactModel.getContactsByLead(id);
    res.json(contacts);
  } catch (error) {
    console.error('Erreur lors de la récupération des contacts:', error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Ajouter un contact à un lead
router.post('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await contactModel.createContact(id, req.body);
    res.status(201).json(contact);
  } catch (error) {
    console.error('Erreur lors de la création du contact:', error);
    if (error.message.includes('requis') || error.message === 'Lead non trouvé') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour un contact
router.put('/:leadId/contacts/:contactId', async (req, res) => {
  try {
    const { leadId, contactId } = req.params;
    const contact = await contactModel.updateContact(leadId, contactId, req.body);
    res.json(contact);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du contact:', error);
    if (error.message === 'Contact non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Supprimer un contact
router.delete('/:leadId/contacts/:contactId', async (req, res) => {
  try {
    const { leadId, contactId } = req.params;
    await contactModel.deleteContact(leadId, contactId);
    res.json({ message: 'Contact supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du contact:', error);
    if (error.message === 'Contact non trouvé') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
