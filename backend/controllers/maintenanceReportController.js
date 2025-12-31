// backend/controllers/maintenanceReportController.js

/**
 * Contrôleur pour la génération et l'envoi des rapports de maintenance
 */

/**
 * Générer un rapport pour un projet maintenance
 */
const generateReport = async (req, res) => {
  const db = req.app.locals.db;
  const { projectId } = req.params;
  const { period_start, period_end, notes } = req.body;

  try {
    // 1. Récupérer les infos du projet et du client
    const projectQuery = `
      SELECT p.*, c.name as client_name, c.email as client_email, c.phone as client_phone
      FROM projects p
      LEFT JOIN crm_clients c ON p.client_id = c.id
      WHERE p.id = $1
    `;
    const projectResult = await db.pool.query(projectQuery, [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    const project = projectResult.rows[0];

    // 2. Récupérer les interventions de la période
    const interventionsQuery = `
      SELECT * FROM interventions
      WHERE project_id = $1
        AND status = 'completed'
        AND (scheduled_date BETWEEN $2 AND $3 OR completed_date BETWEEN $2 AND $3)
      ORDER BY completed_date DESC, scheduled_date DESC
    `;
    const interventionsResult = await db.pool.query(interventionsQuery, [
      projectId,
      period_start,
      period_end
    ]);

    const interventions = interventionsResult.rows;

    // 3. Calculer les statistiques
    const interventionsCount = interventions.length;
    const totalDuration = interventions.reduce((acc, i) => acc + (i.duration_minutes || 0), 0);

    // Grouper par type
    const byType = interventions.reduce((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {});

    // 4. Créer le rapport
    const reportData = {
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        budget: project.budget
      },
      client: {
        name: project.client_name,
        email: project.client_email
      },
      period: {
        start: period_start,
        end: period_end
      },
      summary: {
        interventions_count: interventionsCount,
        total_duration_minutes: totalDuration,
        by_type: byType
      },
      interventions: interventions.map(i => ({
        id: i.id,
        title: i.title,
        description: i.description,
        type: i.type,
        scheduled_date: i.scheduled_date,
        completed_date: i.completed_date,
        duration_minutes: i.duration_minutes
      })),
      generated_at: new Date().toISOString()
    };

    // 5. Sauvegarder le rapport
    const insertQuery = `
      INSERT INTO maintenance_reports (
        project_id, client_id, period_start, period_end,
        interventions_count, total_duration_minutes, report_data,
        status, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, NOW(), NOW())
      RETURNING *
    `;

    const insertResult = await db.pool.query(insertQuery, [
      projectId,
      project.client_id,
      period_start,
      period_end,
      interventionsCount,
      totalDuration,
      JSON.stringify(reportData),
      notes || null
    ]);

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('Erreur génération rapport:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Récupérer les rapports d'un projet
 */
const getReportsByProject = async (req, res) => {
  const db = req.app.locals.db;
  const { projectId } = req.params;

  try {
    const query = `
      SELECT * FROM maintenance_reports
      WHERE project_id = $1
      ORDER BY period_end DESC, created_at DESC
    `;
    const result = await db.pool.query(query, [projectId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération rapports:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Récupérer un rapport par ID
 */
const getReportById = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const query = `SELECT * FROM maintenance_reports WHERE id = $1`;
    const result = await db.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Rapport non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur récupération rapport:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Mettre à jour un rapport (ajouter notes, modifier avant envoi)
 */
const updateReport = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { notes, report_data } = req.body;

  try {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }

    if (report_data !== undefined) {
      updates.push(`report_data = $${paramIndex++}`);
      params.push(JSON.stringify(report_data));
    }

    updates.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());

    params.push(id);

    const query = `
      UPDATE maintenance_reports
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Rapport non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur mise à jour rapport:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Marquer un rapport comme envoyé
 */
const sendReport = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { email } = req.body;

  try {
    // Récupérer le rapport
    const reportQuery = `
      SELECT mr.*, p.name as project_name, c.email as client_email, c.name as client_name
      FROM maintenance_reports mr
      LEFT JOIN projects p ON mr.project_id = p.id
      LEFT JOIN crm_clients c ON mr.client_id = c.id
      WHERE mr.id = $1
    `;
    const reportResult = await db.pool.query(reportQuery, [id]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ message: 'Rapport non trouvé' });
    }

    const report = reportResult.rows[0];
    const sendTo = email || report.client_email;

    // TODO: Intégrer l'envoi d'email réel ici
    // Pour l'instant, on marque juste comme envoyé

    const updateQuery = `
      UPDATE maintenance_reports
      SET status = 'sent', sent_at = NOW(), sent_to = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.pool.query(updateQuery, [sendTo, id]);

    res.json({
      success: true,
      message: `Rapport envoyé à ${sendTo}`,
      report: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur envoi rapport:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Supprimer un rapport
 */
const deleteReport = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const query = `DELETE FROM maintenance_reports WHERE id = $1 RETURNING *`;
    const result = await db.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Rapport non trouvé' });
    }

    res.json({ message: 'Rapport supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression rapport:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Prévisualiser un rapport (HTML)
 */
const previewReport = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const query = `
      SELECT mr.*, p.name as project_name, p.budget,
             c.name as client_name, c.email as client_email
      FROM maintenance_reports mr
      LEFT JOIN projects p ON mr.project_id = p.id
      LEFT JOIN crm_clients c ON mr.client_id = c.id
      WHERE mr.id = $1
    `;
    const result = await db.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Rapport non trouvé' });
    }

    const report = result.rows[0];
    const data = report.report_data;

    // Générer le HTML du rapport
    const typeLabels = {
      'update': 'Mise à jour',
      'backup': 'Sauvegarde',
      'security': 'Sécurité',
      'maintenance': 'Maintenance',
      'support': 'Support',
      'other': 'Autre'
    };

    const formatDuration = (minutes) => {
      if (!minutes) return '-';
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return hours > 0 ? `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}` : `${mins}min`;
    };

    const formatDate = (dateString) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    };

    let interventionsHtml = '';
    if (data.interventions && data.interventions.length > 0) {
      interventionsHtml = data.interventions.map(i => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formatDate(i.completed_date || i.scheduled_date)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${typeLabels[i.type] || i.type}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${i.title}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formatDuration(i.duration_minutes)}</td>
        </tr>
      `).join('');
    } else {
      interventionsHtml = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #6b7280;">Aucune intervention sur cette période</td></tr>';
    }

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport de maintenance - ${report.project_name}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; padding: 30px; }
    .header h1 { margin: 0 0 10px 0; font-size: 24px; }
    .header p { margin: 0; opacity: 0.9; }
    .content { padding: 30px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center; }
    .summary-card .value { font-size: 28px; font-weight: bold; color: #8b5cf6; }
    .summary-card .label { color: #6b7280; font-size: 14px; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f9fafb; padding: 12px; text-align: left; font-weight: 600; color: #374151; }
    .footer { background: #f9fafb; padding: 20px 30px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rapport de maintenance</h1>
      <p>${report.project_name}</p>
      <p style="margin-top: 10px; font-size: 14px;">Période du ${formatDate(report.period_start)} au ${formatDate(report.period_end)}</p>
    </div>

    <div class="content">
      <p>Bonjour ${report.client_name || 'Cher client'},</p>
      <p>Voici le récapitulatif des interventions réalisées sur votre site durant cette période.</p>

      <div class="summary">
        <div class="summary-card">
          <div class="value">${data.summary?.interventions_count || 0}</div>
          <div class="label">Interventions</div>
        </div>
        <div class="summary-card">
          <div class="value">${formatDuration(data.summary?.total_duration_minutes || 0)}</div>
          <div class="label">Temps total</div>
        </div>
        <div class="summary-card">
          <div class="value">${report.budget || '-'}€</div>
          <div class="label">Forfait mensuel</div>
        </div>
      </div>

      <h3 style="color: #374151; margin-bottom: 15px;">Détail des interventions</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th>Durée</th>
          </tr>
        </thead>
        <tbody>
          ${interventionsHtml}
        </tbody>
      </table>

      ${report.notes ? `<p style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; color: #92400e;"><strong>Note :</strong> ${report.notes}</p>` : ''}
    </div>

    <div class="footer">
      <p>Ce rapport a été généré automatiquement par votre service de maintenance.</p>
      <p>Pour toute question, contactez-nous.</p>
    </div>
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Erreur prévisualisation rapport:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  generateReport,
  getReportsByProject,
  getReportById,
  updateReport,
  sendReport,
  deleteReport,
  previewReport
};
