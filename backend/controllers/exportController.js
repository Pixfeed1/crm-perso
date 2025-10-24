// backend/controllers/exportController.js

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

    const leads = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          id, name, company, email, phone, status, type,
          budget, source, notes, created_at
         FROM leads
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

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

    const projects = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          id, name, description, status, start_date, end_date,
          budget, progress, created_at
         FROM projects
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const headers = ['id', 'name', 'description', 'status', 'start_date', 'end_date', 'budget', 'progress', 'created_at'];
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

    const goals = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          id, name, description, category, period, target_value,
          current_value, start_date, end_date, created_at
         FROM goals
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

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

    const revenues = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          r.id, r.description, r.amount, r.date, r.type, r.status,
          p.name as project_name, r.created_at
         FROM revenues r
         LEFT JOIN projects p ON r.project_id = p.id
         ORDER BY r.date DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const headers = ['id', 'description', 'amount', 'date', 'type', 'status', 'project_name', 'created_at'];
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

    const activities = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          a.id, a.description, a.type, a.date, a.planned_time,
          a.actual_time, a.status, a.priority,
          p.name as project_name, l.name as lead_name, a.created_at
         FROM activities a
         LEFT JOIN projects p ON a.project_id = p.id
         LEFT JOIN leads l ON a.lead_id = l.id
         ORDER BY a.date DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

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

    const contacts = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          c.id, c.name, c.email, c.phone, c.position,
          c.is_primary, c.notes, l.name as lead_name,
          l.company as lead_company, c.created_at
         FROM contacts c
         LEFT JOIN leads l ON c.lead_id = l.id
         ORDER BY c.created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const headers = ['id', 'name', 'email', 'phone', 'position', 'is_primary', 'notes', 'lead_name', 'lead_company', 'created_at'];
    const csv = arrayToCSV(contacts, headers);

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

    const clients = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
          id, name, company, type, email, phone, address,
          website, industry, source, contract_start_date,
          lifetime_value, status, tags, notes, created_at, updated_at
         FROM crm_clients
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

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
 * Export complet (toutes les données) en ZIP
 * Note: Pour simplifier, on retourne un objet JSON avec toutes les données
 * Le frontend pourra télécharger plusieurs fichiers CSV
 */
const exportAll = async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Récupérer toutes les entités en parallèle
    const [leads, projects, goals, revenues, activities, contacts] = await Promise.all([
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM leads ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM projects ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM goals ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM revenues ORDER BY date DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM activities ORDER BY date DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise((resolve, reject) => {
        db.all('SELECT * FROM contacts ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      })
    ]);

    // Retourner un JSON avec toutes les données
    res.json({
      export_date: new Date().toISOString(),
      leads,
      projects,
      goals,
      revenues,
      activities,
      contacts,
      totals: {
        leads: leads.length,
        projects: projects.length,
        goals: goals.length,
        revenues: revenues.length,
        activities: activities.length,
        contacts: contacts.length
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
