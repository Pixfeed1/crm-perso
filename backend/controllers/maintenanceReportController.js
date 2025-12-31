// backend/controllers/maintenanceReportController.js
const emailService = require('../services/emailService');

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

    if (!sendTo) {
      return res.status(400).json({
        success: false,
        message: 'Aucune adresse email définie pour ce client'
      });
    }

    // Envoyer l'email via emailService
    try {
      await emailService.sendMaintenanceReportEmail(report, {
        recipientEmail: sendTo,
        ccToSelf: true
      });
    } catch (emailError) {
      console.error('Erreur envoi email:', emailError);
      return res.status(500).json({
        success: false,
        message: `Erreur lors de l'envoi de l'email: ${emailError.message}`
      });
    }

    // Mettre à jour le statut du rapport
    const updateQuery = `
      UPDATE maintenance_reports
      SET status = 'sent', sent_at = NOW(), sent_to = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.pool.query(updateQuery, [sendTo, id]);

    res.json({
      success: true,
      message: `Rapport envoyé avec succès à ${sendTo}`,
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

    const typeIcons = {
      'update': '🔄',
      'backup': '💾',
      'security': '🔒',
      'maintenance': '🔧',
      'support': '💬',
      'other': '📋'
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

    const formatDateShort = (dateString) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    };

    let interventionsHtml = '';
    if (data.interventions && data.interventions.length > 0) {
      interventionsHtml = data.interventions.map(i => `
        <tr>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${formatDateShort(i.completed_date || i.scheduled_date)}</td>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; background: #f3e8ff; color: #7c3aed; font-size: 12px; font-weight: 500;">
              ${typeIcons[i.type] || '📋'} ${typeLabels[i.type] || i.type}
            </span>
          </td>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${i.title}</td>
          <td style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; text-align: center;">${formatDuration(i.duration_minutes)}</td>
        </tr>
      `).join('');
    } else {
      interventionsHtml = '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #9ca3af; font-style: italic;">Aucune intervention sur cette période</td></tr>';
    }

    const forfaitMensuel = report.budget || 0;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport de maintenance - ${report.project_name}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .preview-badge { position: fixed; top: 20px; right: 20px; background: #fbbf24; color: #1f2937; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 1000; }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="preview-badge">📧 Prévisualisation du rapport</div>

  <div class="container">
    <!-- Header avec logo Pixfeed -->
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #6366f1 50%, #8b5cf6 100%); padding: 35px 30px; text-align: center;">
      <img src="https://pixfeed.net/wp-content/uploads/2024/01/pixfeed-logo-blanc.png" alt="Pixfeed" style="height: 45px; margin-bottom: 20px;" />
      <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 600; letter-spacing: -0.5px;">Rapport de Maintenance</h1>
      <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">${report.project_name}</p>
      <div style="margin-top: 15px; display: inline-block; background: rgba(255,255,255,0.2); padding: 8px 20px; border-radius: 25px;">
        <span style="color: #ffffff; font-size: 14px;">📅 ${formatDate(report.period_start)} → ${formatDate(report.period_end)}</span>
      </div>
    </div>

    <!-- Contenu principal -->
    <div style="padding: 40px 35px;">

      <!-- Message d'introduction -->
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        Bonjour <strong>${report.client_name || 'Cher client'}</strong>,
      </p>
      <p style="color: #6b7280; font-size: 15px; line-height: 1.7; margin: 0 0 30px 0;">
        Voici le récapitulatif des interventions réalisées sur votre site durant cette période.
        Ce rapport vous permet de suivre l'ensemble des actions effectuées dans le cadre de votre forfait de maintenance.
      </p>

      <!-- Statistiques -->
      <div style="margin: 30px 0; background: #fafafa; border-radius: 16px; padding: 5px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 33%; padding: 25px 15px; text-align: center; vertical-align: top;">
              <div style="font-size: 36px; font-weight: 700; color: #7c3aed; line-height: 1;">${data.summary?.interventions_count || 0}</div>
              <div style="color: #6b7280; font-size: 13px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Interventions</div>
            </td>
            <td style="width: 33%; padding: 25px 15px; text-align: center; vertical-align: top; border-left: 2px solid #e5e7eb; border-right: 2px solid #e5e7eb;">
              <div style="font-size: 36px; font-weight: 700; color: #7c3aed; line-height: 1;">${formatDuration(data.summary?.total_duration_minutes || 0)}</div>
              <div style="color: #6b7280; font-size: 13px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Temps total</div>
            </td>
            <td style="width: 33%; padding: 25px 15px; text-align: center; vertical-align: top;">
              <div style="font-size: 36px; font-weight: 700; color: #10b981; line-height: 1;">${forfaitMensuel}€</div>
              <div style="color: #6b7280; font-size: 13px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Forfait/mois</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Tableau des interventions -->
      <div style="margin: 35px 0;">
        <h3 style="color: #1f2937; font-size: 18px; font-weight: 600; margin: 0 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb;">
          📋 Détail des interventions
        </h3>
        <table style="width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);">
              <th style="padding: 16px 12px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Date</th>
              <th style="padding: 16px 12px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Type</th>
              <th style="padding: 16px 12px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
              <th style="padding: 16px 12px; text-align: center; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Durée</th>
            </tr>
          </thead>
          <tbody>
            ${interventionsHtml}
          </tbody>
        </table>
      </div>

      ${report.notes ? `
      <div style="margin: 30px 0; padding: 20px; background: #fef3c7; border-radius: 12px; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
          <strong>📝 Note importante :</strong><br>
          ${report.notes}
        </p>
      </div>
      ` : ''}

      <!-- Message de conclusion -->
      <p style="color: #6b7280; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0;">
        Pour toute question concernant ce rapport ou votre forfait de maintenance, n'hésitez pas à me contacter directement.
      </p>

      <!-- Signature Pixfeed professionnelle -->
      <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
        <table cellpadding="0" cellspacing="0" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <tr>
            <td style="vertical-align: top; padding-right: 20px;">
              <img src="https://pixfeed.net/wp-content/uploads/2024/01/pixfeed-logo-couleur.png" alt="Pixfeed" style="width: 120px; height: auto;" />
            </td>
            <td style="vertical-align: top; border-left: 3px solid #7c3aed; padding-left: 20px;">
              <p style="margin: 0 0 5px 0; font-size: 16px; font-weight: 600; color: #1f2937;">Marc Gueffie</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #7c3aed; font-weight: 500;">Développeur chez Pixfeed</p>
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">
                📞 <a href="tel:+33612345678" style="color: #6b7280;">06 12 34 56 78</a>
              </p>
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;">
                ✉️ <a href="mailto:contact@pixfeed.fr" style="color: #6b7280;">contact@pixfeed.fr</a>
              </p>
              <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;">
                🌐 <a href="https://pixfeed.net" style="color: #7c3aed; font-weight: 500;">pixfeed.net</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; font-style: italic;">
                "L'humain au cœur de nos solutions"
              </p>
            </td>
          </tr>
        </table>
      </div>

    </div>

    <!-- Footer -->
    <div style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%); padding: 25px 35px; text-align: center;">
      <p style="margin: 0 0 10px 0; color: rgba(255,255,255,0.9); font-size: 13px;">
        Ce rapport a été généré automatiquement par votre service de maintenance Pixfeed
      </p>
      <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 12px;">
        © ${new Date().getFullYear()} Pixfeed - Tous droits réservés
      </p>
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
