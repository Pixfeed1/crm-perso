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
        contacts: [],
        total: 0
      });
    }

    const searchTerm = query.toLowerCase();

    // Récupérer toutes les données en parallèle
    const [allLeads, allProjects, allGoals, allActivities] = await Promise.all([
      leadModel.getAllLeads(db).catch(() => []),
      projectModel.getAllProjects(db).catch(() => []),
      goalModel.getAllGoals(db).catch(() => []),
      activityModel.getAllActivities(db).catch(() => [])
    ]);

    // Recherche dans les leads
    const leads = allLeads
      .filter(lead =>
        (lead.name && lead.name.toLowerCase().includes(searchTerm)) ||
        (lead.company && lead.company.toLowerCase().includes(searchTerm)) ||
        (lead.email && lead.email.toLowerCase().includes(searchTerm))
      )
      .map(lead => ({
        id: lead.id,
        name: lead.name,
        company: lead.company,
        status: lead.status,
        type: lead.type
      }))
      .slice(0, 10);

    // Recherche dans les projets
    const projects = allProjects
      .filter(project =>
        (project.name && project.name.toLowerCase().includes(searchTerm)) ||
        (project.description && project.description.toLowerCase().includes(searchTerm))
      )
      .map(project => ({
        id: project.id,
        name: project.name,
        status: project.status,
        start_date: project.start_date,
        end_date: project.end_date
      }))
      .slice(0, 10);

    // Recherche dans les objectifs
    const goals = allGoals
      .filter(goal =>
        (goal.name && goal.name.toLowerCase().includes(searchTerm)) ||
        (goal.description && goal.description.toLowerCase().includes(searchTerm)) ||
        (goal.category && goal.category.toLowerCase().includes(searchTerm))
      )
      .map(goal => ({
        id: goal.id,
        name: goal.name,
        category: goal.category,
        current_value: goal.current_value,
        target_value: goal.target_value
      }))
      .slice(0, 10);

    // Recherche dans les activités
    const activities = allActivities
      .filter(activity =>
        (activity.description && activity.description.toLowerCase().includes(searchTerm)) ||
        (activity.type && activity.type.toLowerCase().includes(searchTerm))
      )
      .map(activity => ({
        id: activity.id,
        description: activity.description,
        type: activity.type,
        date: activity.date,
        status: activity.status
      }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 10);

    // Recherche dans les contacts (via les leads avec leurs contacts)
    const contacts = [];
    for (const lead of allLeads) {
      try {
        const leadContacts = await leadModel.getLeadContacts(db, lead.id);
        const matchingContacts = leadContacts
          .filter(contact =>
            (contact.name && contact.name.toLowerCase().includes(searchTerm)) ||
            (contact.email && contact.email.toLowerCase().includes(searchTerm)) ||
            (contact.position && contact.position.toLowerCase().includes(searchTerm))
          )
          .map(contact => ({
            id: contact.id,
            name: contact.name,
            email: contact.email,
            position: contact.position,
            lead_id: contact.lead_id,
            lead_name: lead.name
          }));

        contacts.push(...matchingContacts);

        // Limiter à 10 résultats
        if (contacts.length >= 10) {
          contacts.splice(10);
          break;
        }
      } catch (error) {
        // Continuer même en cas d'erreur sur un lead
        continue;
      }
    }

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
