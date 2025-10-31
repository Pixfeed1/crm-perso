// backend/controllers/exportController.js

const leadModel = require('../models/leadModel');
const projectModel = require('../models/projectModel');
const goalModel = require('../models/goalModel');
const revenueModel = require('../models/revenueModel');
const activityModel = require('../models/activityModel');
const clientModel = require('../models/clientModel');

/**
 * Convertit un tableau d'objets en CSV
 */
const arrayToCSV = (data, headers) => {
  if (!data || data.length === 0) {
    return '';
  }

  // En-têtes
  const csvHeaders = headers.join(',');

  // Lignes de données
  const csvRows = data.map(row => {
    return headers.map(header => {
      let value = row[header] || '';

      // Gérer les valeurs avec virgules, guillemets ou sauts de ligne
      if (typeof value === 'string') {
        value = value.replace(/"/g, '""'); // Échapper les guillemets
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value}"`;
        }
      }

      return value;
    }).join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
};

/**
 * Export des leads en CSV
 */
const exportLeads = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const leads = await leadModel.getAllLeads(db);

    const headers = ['id', 'name', 'company', 'email', 'phone', 'status', 'type', 'budget', 'source', 'notes', 'created_at'];
    const csv = arrayToCSV(leads, headers);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv); // BOM pour UTF-8
  } catch (error) {
    console.error('Erreur lors de l\'export des leads:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Export des projets en CSV
 */
const exportProjects = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const projects = await projectModel.getAllProjects(db);

    const headers = ['id', 'name', 'description', 'status', 'start_date', 'end_date', 'amount', 'progress', 'created_at'];
    const csv = arrayToCSV(projects, headers);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="projects_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Erreur lors de l\'export des projets:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Export des objectifs en CSV
 */
const exportGoals = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const goals = await goalModel.getAllGoals(db);

    const headers = ['id', 'name', 'description', 'category', 'period', 'target_value', 'current_value', 'start_date', 'end_date', 'created_at'];
    const csv = arrayToCSV(goals, headers);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="goals_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Erreur lors de l\'export des objectifs:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Export des revenus en CSV
 */
const exportRevenues = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const revenues = await revenueModel.getAllRevenues(db, {});

    const headers = ['id', 'description', 'amount', 'date', 'type', 'status', 'project_id', 'created_at'];
    const csv = arrayToCSV(revenues, headers);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="revenues_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Erreur lors de l\'export des revenus:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Export des activités en CSV
 */
const exportActivities = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const activities = await activityModel.getAllActivities(db);

    const headers = ['id', 'description', 'type', 'date', 'planned_time', 'actual_time', 'status', 'priority', 'project_name', 'lead_name', 'created_at'];
    const csv = arrayToCSV(activities, headers);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="activities_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Erreur lors de l\'export des activités:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Export des contacts en CSV
 */
const exportContacts = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Récupérer tous les contacts via les leads
    const allLeads = await leadModel.getAllLeads(db);
    const allContacts = [];

    for (const lead of allLeads) {
      const leadContacts = await leadModel.getLeadContacts(db, lead.id);
      leadContacts.forEach(contact => {
        allContacts.push({
          ...contact,
          lead_name: lead.name,
          lead_company: lead.company
        });
      });
    }

    const headers = ['id', 'name', 'email', 'phone', 'position', 'is_primary', 'notes', 'lead_name', 'lead_company', 'created_at'];
    const csv = arrayToCSV(allContacts, headers);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contacts_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Erreur lors de l\'export des contacts:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Export des clients en CSV
 */
const exportClients = async (req, res) => {
  try {
    const db = req.app.locals.db;
    const clients = await clientModel.getAllClients(db);

    const headers = ['id', 'name', 'company', 'type', 'email', 'phone', 'address', 'website', 'industry', 'source', 'contract_start_date', 'lifetime_value', 'status', 'tags', 'notes', 'created_at', 'updated_at'];
    const csv = arrayToCSV(clients, headers);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clients_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Erreur lors de l\'export des clients:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

/**
 * Export complet (toutes les données) en JSON
 * Le frontend pourra télécharger plusieurs fichiers CSV
 */
const exportAll = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Récupérer toutes les entités en parallèle
    const [leads, projects, goals, revenues, activities, clients] = await Promise.all([
      leadModel.getAllLeads(db).catch(() => []),
      projectModel.getAllProjects(db).catch(() => []),
      goalModel.getAllGoals(db).catch(() => []),
      revenueModel.getAllRevenues(db, {}).catch(() => []),
      activityModel.getAllActivities(db).catch(() => []),
      clientModel.getAllClients(db).catch(() => [])
    ]);

    // Récupérer tous les contacts
    const allContacts = [];
    for (const lead of leads) {
      try {
        const leadContacts = await leadModel.getLeadContacts(db, lead.id);
        allContacts.push(...leadContacts);
      } catch (error) {
        // Continuer même en cas d'erreur
      }
    }

    // Retourner un JSON avec toutes les données
    res.json({
      export_date: new Date().toISOString(),
      leads,
      projects,
      goals,
      revenues,
      activities,
      clients,
      contacts: allContacts,
      totals: {
        leads: leads.length,
        projects: projects.length,
        goals: goals.length,
        revenues: revenues.length,
        activities: activities.length,
        clients: clients.length,
        contacts: allContacts.length
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'export complet:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

module.exports = {
  exportLeads,
  exportProjects,
  exportGoals,
  exportRevenues,
  exportActivities,
  exportContacts,
  exportClients,
  exportAll
};
