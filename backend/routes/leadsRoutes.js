// backend/routes/leadsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const leadController = require('../controllers/leadController');
const leadModel = require('../models/leadModel');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir les statistiques Kanban
router.get('/kanban/stats', leadController.getKanbanStats);

// Obtenir tous les leads
router.get('/', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const leads = await leadModel.getAllLeads(db);
    res.json(leads);
  } catch (error) {
    console.error('Erreur lors de la récupération des leads:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un lead spécifique
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const lead = await leadModel.getLeadById(db, id);

    if (!lead) {
      return res.status(404).json({ message: 'Lead non trouvé' });
    }

    res.json(lead);
  } catch (error) {
    console.error('Erreur lors de la récupération du lead:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un nouveau lead
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const { name, company, type, status, source, notes } = req.body;

  if (!name || !status) {
    return res.status(400).json({ message: 'Nom et statut sont requis' });
  }

  try {
    const lead = await leadModel.createLead(db, {
      name,
      company,
      type,
      status,
      source,
      notes
    });

    res.status(201).json(lead);
  } catch (error) {
    console.error('Erreur lors de la création du lead:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un lead
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { name, company, type, status, source, notes } = req.body;

  try {
    // Vérifier si le lead existe
    const existingLead = await leadModel.getLeadById(db, id);
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead non trouvé' });
    }

    const updatedLead = await leadModel.updateLead(db, id, {
      name,
      company,
      type,
      status,
      source,
      notes
    });

    res.json(updatedLead);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du lead:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un lead
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // Vérifier si le lead existe
    const existingLead = await leadModel.getLeadById(db, id);
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead non trouvé' });
    }

    await leadModel.deleteLead(db, id);
    res.json({ message: 'Lead supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du lead:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir tous les contacts d'un lead
router.get('/:id/contacts', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // Vérifier si le lead existe
    const existingLead = await leadModel.getLeadById(db, id);
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead non trouvé' });
    }

    const contacts = await leadModel.getLeadContacts(db, id);
    res.json(contacts);
  } catch (error) {
    console.error('Erreur lors de la récupération des contacts:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Ajouter un contact à un lead
router.post('/:id/contacts', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { name, position, email, phone, is_primary, notes } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Nom du contact requis' });
  }

  try {
    // Vérifier si le lead existe
    const existingLead = await leadModel.getLeadById(db, id);
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead non trouvé' });
    }

    const contact = await leadModel.createContact(db, id, {
      name,
      position,
      email,
      phone,
      is_primary,
      notes
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error('Erreur lors de la création du contact:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un contact
router.put('/:leadId/contacts/:contactId', async (req, res) => {
  const db = req.app.locals.db;
  const { leadId, contactId } = req.params;
  const { name, position, email, phone, is_primary, notes } = req.body;

  try {
    // Vérifier si le contact existe et appartient au lead
    const existingContact = await leadModel.checkContactExists(db, contactId, leadId);
    if (!existingContact) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    const updatedContact = await leadModel.updateContact(db, contactId, leadId, {
      name,
      position,
      email,
      phone,
      is_primary,
      notes
    });

    res.json(updatedContact);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du contact:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un contact
router.delete('/:leadId/contacts/:contactId', async (req, res) => {
  const db = req.app.locals.db;
  const { leadId, contactId } = req.params;

  try {
    // Vérifier si le contact existe et appartient au lead
    const existingContact = await leadModel.checkContactExists(db, contactId, leadId);
    if (!existingContact) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    await leadModel.deleteContact(db, contactId, leadId);
    res.json({ message: 'Contact supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du contact:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ========================================
// Routes de liaison Contact <-> Client
// ========================================

// Lier un contact existant à un client existant
router.post('/:leadId/contacts/:contactId/link-client', async (req, res) => {
  const db = req.app.locals.db;
  const { leadId, contactId } = req.params;
  const { clientId } = req.body;

  try {
    // Vérifier si le contact existe et appartient au lead
    const existingContact = await leadModel.checkContactExists(db, contactId, leadId);
    if (!existingContact) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    if (!clientId) {
      return res.status(400).json({ message: 'ID du client requis' });
    }

    const updatedContact = await leadModel.linkContactToClient(db, contactId, clientId);
    res.json({
      message: 'Contact lié au client avec succès',
      contact: updatedContact
    });
  } catch (error) {
    console.error('Erreur lors de la liaison contact-client:', error);
    res.status(500).json({
      message: error.message || 'Erreur serveur'
    });
  }
});

// Créer un nouveau client particulier depuis un contact
router.post('/:leadId/contacts/:contactId/create-client', async (req, res) => {
  const db = req.app.locals.db;
  const { leadId, contactId } = req.params;
  const additionalData = req.body || {};

  try {
    // Vérifier si le contact existe et appartient au lead
    const existingContact = await leadModel.checkContactExists(db, contactId, leadId);
    if (!existingContact) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    // Vérifier si le contact n'est pas déjà lié à un client
    if (existingContact.client_id) {
      return res.status(400).json({
        message: 'Ce contact est déjà lié à un client',
        client_id: existingContact.client_id
      });
    }

    const result = await leadModel.createClientFromContact(db, contactId, additionalData);
    res.status(201).json({
      message: 'Client créé et lié au contact avec succès',
      contact: result.contact,
      client_id: result.client_id
    });
  } catch (error) {
    console.error('Erreur lors de la création du client depuis le contact:', error);
    res.status(500).json({
      message: error.message || 'Erreur serveur'
    });
  }
});

// Délier un contact de son client
router.delete('/:leadId/contacts/:contactId/unlink-client', async (req, res) => {
  const db = req.app.locals.db;
  const { leadId, contactId } = req.params;

  try {
    // Vérifier si le contact existe et appartient au lead
    const existingContact = await leadModel.checkContactExists(db, contactId, leadId);
    if (!existingContact) {
      return res.status(404).json({ message: 'Contact non trouvé' });
    }

    if (!existingContact.client_id) {
      return res.status(400).json({ message: 'Ce contact n\'est pas lié à un client' });
    }

    const updatedContact = await leadModel.unlinkContactFromClient(db, contactId);
    res.json({
      message: 'Contact délié du client avec succès',
      contact: updatedContact
    });
  } catch (error) {
    console.error('Erreur lors du déliaison contact-client:', error);
    res.status(500).json({
      message: error.message || 'Erreur serveur'
    });
  }
});

module.exports = router;
