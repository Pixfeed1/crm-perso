// backend/routes/leadsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const leadController = require('../controllers/leadController');
const leadModel = require('../models/leadModel');
const emailService = require('../services/emailService');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// POST /api/leads/:id/send-email — envoi immédiat depuis une fiche prospect + log Suivi.
// Réutilise emailService (SMTP .env) ; logge une interaction email (table interactions).
router.post('/:id/send-email', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { to, subject, body, signature = '' } = req.body || {};
  if (!to || !subject || !body) {
    return res.status(400).json({ message: 'Destinataire, objet et message sont requis' });
  }
  try {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#374151;">`
      + `<div style="white-space:pre-wrap;">${esc(body)}</div>`
      + (signature ? `<div style="margin-top:18px;">${signature}</div>` : '')
      + `</div>`;
    await emailService.sendEmail({ to, subject, html, text: body });
    // Log automatique dans Suivi (best-effort)
    try {
      await db.pool.query(
        `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done)
         VALUES ('lead', $1, 'email', NOW(), $2, FALSE)`,
        [id, subject]
      );
    } catch (logErr) {
      console.error('[Lead] Échec log interaction email:', logErr.message);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[Lead] Erreur envoi email:', error);
    res.status(500).json({ message: error.message || "Erreur lors de l'envoi de l'email" });
  }
});

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
  const { name, company, type, status, source, notes, email, phone, score, tags, assigned_to } = req.body;

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
      notes,
      email,
      phone,
      score,
      tags,
      assigned_to
    });

    res.status(201).json(lead);
  } catch (error) {
    console.error('Erreur lors de la création du lead:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Importer plusieurs leads depuis JSON
router.post('/import', async (req, res) => {
  const db = req.app.locals.db;
  const { leads: leadsToImport } = req.body;

  if (!Array.isArray(leadsToImport) || leadsToImport.length === 0) {
    return res.status(400).json({ message: 'Un tableau de leads est requis' });
  }

  const results = {
    success: [],
    errors: []
  };

  for (const leadData of leadsToImport) {
    try {
      // Valider les champs requis
      if (!leadData.name) {
        results.errors.push({ lead: leadData, error: 'Nom requis' });
        continue;
      }

      // Créer le lead avec toutes les infos
      const lead = await leadModel.createLead(db, {
        name: leadData.name,
        company: leadData.company || null,
        type: leadData.type || 'individual',
        status: leadData.status || 'new',
        source: leadData.source || null,
        notes: leadData.notes || null,
        email: leadData.email || null,
        phone: leadData.phone || null,
        score: leadData.score || 0,
        tags: leadData.tags || null,
        assigned_to: leadData.assigned_to || null
      });

      results.success.push(lead);
    } catch (error) {
      results.errors.push({ lead: leadData, error: error.message });
    }
  }

  res.status(201).json({
    message: `${results.success.length} lead(s) importé(s), ${results.errors.length} erreur(s)`,
    imported: results.success,
    errors: results.errors
  });
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

// ========================================
// Routes d'import de leads
// ========================================

const multer = require('multer');
const LeadImportService = require('../services/leadImportService');
const path = require('path');
const fs = require('fs');

// Configuration multer pour l'upload de fichiers
const upload = multer({
  dest: 'uploads/imports/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedMimes.includes(file.mimetype) ||
        file.originalname.endsWith('.csv') ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté. Utilisez CSV ou Excel (.xlsx, .xls)'));
    }
  }
});

// Upload et analyse du fichier
router.post('/import/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    console.log('Fichier reçu:', req.file.originalname);

    // Parser le fichier
    const { headers, data } = await LeadImportService.parseFile(
      req.file.path,
      req.file.mimetype
    );

    // Mapping intelligent
    const suggestedMapping = LeadImportService.intelligentMapping(headers);

    // Prévisualisation (5 premières lignes)
    const preview = data.slice(0, 5);

    // Supprimer le fichier temporaire après parsing
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      headers,
      suggestedMapping,
      preview,
      totalRows: data.length,
      // Sauvegarder les données en session pour l'import
      sessionId: Date.now().toString()
    });

  } catch (error) {
    console.error('Erreur lors de l\'upload:', error);

    // Nettoyer le fichier en cas d'erreur
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors du traitement du fichier'
    });
  }
});

// Exécuter l'import avec le mapping fourni
router.post('/import/execute', upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    const { mapping, checkDuplicates } = req.body;

    if (!mapping) {
      return res.status(400).json({ message: 'Mapping requis' });
    }

    console.log('Démarrage de l\'import...');
    console.log('Mapping:', mapping);

    // Parser le mapping (vient en JSON string du frontend)
    const parsedMapping = typeof mapping === 'string' ? JSON.parse(mapping) : mapping;

    // Parser le fichier
    const { data } = await LeadImportService.parseFile(
      req.file.path,
      req.file.mimetype
    );

    console.log(`${data.length} lignes à importer`);

    // Exécuter l'import
    const results = await LeadImportService.importLeads(db, data, parsedMapping, {
      checkDuplicates: checkDuplicates !== 'false'
    });

    // Supprimer le fichier temporaire
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Erreur lors de l\'import:', error);

    // Nettoyer le fichier en cas d'erreur
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de l\'import'
    });
  }
});

module.exports = router;
