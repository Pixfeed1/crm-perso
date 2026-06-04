// backend/controllers/maintenanceReportController.js
const emailService = require('../services/emailService');
const pdfService = require('../services/pdfService');

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
 * Envoyer un rapport par email avec PDF en pièce jointe
 */
const sendReport = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { email } = req.body;

  try {
    // Récupérer le rapport avec budget
    const reportQuery = `
      SELECT mr.*, p.name as project_name, p.budget,
             c.email as client_email, c.name as client_name
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
    const data = report.report_data;
    const sendTo = email || report.client_email;

    if (!sendTo) {
      return res.status(400).json({
        success: false,
        message: 'Aucune adresse email définie pour ce client'
      });
    }

    // Générer le PDF
    let pdfBuffer = null;
    let pdfFileName = null;
    try {
      pdfBuffer = await pdfService.generateMaintenanceReportPDF(report, data);
      const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR').replace(/\//g, '-');
      pdfFileName = `Rapport_Maintenance_${report.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(report.period_start)}.pdf`;
      console.log('✅ PDF généré avec succès');
    } catch (pdfError) {
      console.warn('⚠️ Impossible de générer le PDF:', pdfError.message);
      // Continuer sans PDF si erreur
    }

    // Envoyer l'email via emailService
    try {
      await emailService.sendMaintenanceReportEmail(report, {
        recipientEmail: sendTo,
        ccToSelf: true,
        pdfBuffer: pdfBuffer,
        pdfFileName: pdfFileName
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
      message: `Rapport envoyé avec succès à ${sendTo}` + (pdfBuffer ? ' (avec PDF)' : ' (sans PDF)'),
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

    // HTML du rapport via la charte commune (reportTemplate, identique au PDF)
    const html = pdfService.generateReportHTML(report, data);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Erreur prévisualisation rapport:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Télécharger le rapport en PDF
 */
const downloadPDF = async (req, res) => {
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

    // Générer le PDF
    const pdfBuffer = await pdfService.generateMaintenanceReportPDF(report, data);

    // Formater le nom du fichier
    const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR').replace(/\//g, '-');
    const fileName = `Rapport_Maintenance_${report.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(report.period_start)}_${formatDate(report.period_end)}.pdf`;

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    res.status(500).json({ message: 'Erreur lors de la génération du PDF: ' + error.message });
  }
};

/**
 * Générer un rapport pour un contrat de maintenance
 */
const generateContractReport = async (req, res) => {
  const db = req.app.locals.db;
  const { contractId } = req.params;
  const { period_start, period_end, notes, report_data } = req.body;

  try {
    // 1. Récupérer les infos du contrat et du client
    const contractQuery = `
      SELECT mc.*, c.name as client_name, c.email as client_email, c.phone as client_phone
      FROM maintenance_contracts mc
      LEFT JOIN crm_clients c ON mc.client_id = c.id
      WHERE mc.id = $1
    `;
    const contractResult = await db.pool.query(contractQuery, [contractId]);

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ message: 'Contrat non trouvé' });
    }

    const contract = contractResult.rows[0];

    // 2. Récupérer les interventions de la période (si elles existent)
    const interventionsQuery = `
      SELECT * FROM interventions
      WHERE maintenance_contract_id = $1
        AND status = 'completed'
        AND (scheduled_date BETWEEN $2 AND $3 OR completed_date BETWEEN $2 AND $3)
      ORDER BY completed_date DESC, scheduled_date DESC
    `;
    const interventionsResult = await db.pool.query(interventionsQuery, [
      contractId,
      period_start,
      period_end
    ]);

    const interventions = interventionsResult.rows;

    // 3. Calculer les statistiques
    const interventionsCount = interventions.length;
    const totalDuration = interventions.reduce((acc, i) => acc + (i.duration_minutes || 0), 0);

    // 4. Créer le rapport avec les données fournies
    const finalReportData = {
      contract: {
        id: contract.id,
        site_name: contract.site_name,
        site_url: contract.site_url,
        wordpress_version: contract.wordpress_version,
        monthly_amount: contract.monthly_amount
      },
      client: {
        name: contract.client_name,
        email: contract.client_email
      },
      period: {
        start: period_start,
        end: period_end
      },
      summary: {
        interventions_count: interventionsCount,
        total_duration_minutes: totalDuration
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
      // Données du formulaire
      ...report_data,
      generated_at: new Date().toISOString()
    };

    // 5. Sauvegarder le rapport
    const insertQuery = `
      INSERT INTO maintenance_reports (
        maintenance_contract_id, client_id, period_start, period_end,
        interventions_count, total_duration_minutes, report_data,
        status, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, NOW(), NOW())
      RETURNING *
    `;

    const insertResult = await db.pool.query(insertQuery, [
      contractId,
      contract.client_id,
      period_start,
      period_end,
      interventionsCount,
      totalDuration,
      JSON.stringify(finalReportData),
      notes || null
    ]);

    // 6. Mettre à jour la date du dernier rapport sur le contrat
    await db.pool.query(`
      UPDATE maintenance_contracts
      SET last_report_date = $1,
          next_report_due = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [
      new Date().toISOString(),
      new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split('T')[0],
      contractId
    ]);

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('Erreur génération rapport contrat:', error);
    res.status(500).json({ message: 'Erreur serveur: ' + error.message });
  }
};

/**
 * Récupérer les rapports d'un contrat
 */
const getReportsByContract = async (req, res) => {
  const db = req.app.locals.db;
  const { contractId } = req.params;

  try {
    const query = `
      SELECT * FROM maintenance_reports
      WHERE maintenance_contract_id = $1
      ORDER BY period_end DESC, created_at DESC
    `;
    const result = await db.pool.query(query, [contractId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération rapports contrat:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  generateReport,
  generateContractReport,
  getReportsByProject,
  getReportsByContract,
  getReportById,
  updateReport,
  sendReport,
  deleteReport,
  previewReport,
  downloadPDF
};
