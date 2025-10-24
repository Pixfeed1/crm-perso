// backend/routes/exportRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionsMiddleware');
const leadModel = require('../models/leadModel');
const projectModel = require('../models/projectModel');
const revenueModel = require('../models/revenueModel');
const { exportLeadsToExcel, exportProjectsToExcel, exportRevenuesToExcel, exportCustomReport } = require('../utils/excelExport');
const { exportAnalyticsToPDF, exportLeadsToPDF } = require('../utils/pdfExport');

// Appliquer le middleware d'authentification
router.use(authMiddleware);

/**
 * GET /api/export/leads/excel
 * Exporter tous les leads en Excel
 */
router.get('/leads/excel', requirePermission('read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const leads = await leadModel.getAllLeads(userId);

    const buffer = await exportLeadsToExcel(leads);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=leads-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Erreur lors de l\'export des leads:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export', error: error.message });
  }
});

/**
 * GET /api/export/leads/pdf
 * Exporter les leads en PDF
 */
router.get('/leads/pdf', requirePermission('read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const leads = await leadModel.getAllLeads(userId);

    const buffer = await exportLeadsToPDF(leads);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=leads-${Date.now()}.pdf`);
    res.send(buffer);
  } catch (error) {
    console.error('Erreur lors de l\'export PDF des leads:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export', error: error.message });
  }
});

/**
 * GET /api/export/projects/excel
 * Exporter tous les projets en Excel
 */
router.get('/projects/excel', requirePermission('read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const projects = await projectModel.getAllProjects(userId);

    const buffer = await exportProjectsToExcel(projects);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=projects-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Erreur lors de l\'export des projets:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export', error: error.message });
  }
});

/**
 * GET /api/export/revenues/excel
 * Exporter tous les revenus en Excel
 */
router.get('/revenues/excel', requirePermission('read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const revenues = await revenueModel.getAllRevenues(userId);

    const buffer = await exportRevenuesToExcel(revenues);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=revenues-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Erreur lors de l\'export des revenus:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export', error: error.message });
  }
});

/**
 * GET /api/export/analytics/pdf
 * Exporter les statistiques analytics en PDF
 */
router.get('/analytics/pdf', requirePermission('read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const token = req.headers.authorization;

    // Récupérer toutes les données analytics
    const [roiRes, productivityRes, revenueRes, performanceRes] = await Promise.all([
      fetch('http://localhost:5000/api/stats/roi-by-project', {
        headers: { 'Authorization': token }
      }),
      fetch('http://localhost:5000/api/stats/productivity', {
        headers: { 'Authorization': token }
      }),
      fetch('http://localhost:5000/api/stats/revenue-analysis', {
        headers: { 'Authorization': token }
      }),
      fetch('http://localhost:5000/api/stats/performance-overview', {
        headers: { 'Authorization': token }
      })
    ]);

    const roi = roiRes.ok ? await roiRes.json() : null;
    const productivity = productivityRes.ok ? await productivityRes.json() : null;
    const revenueAnalysis = revenueRes.ok ? await revenueRes.json() : null;
    const performanceOverview = performanceRes.ok ? await performanceRes.json() : null;

    const buffer = await exportAnalyticsToPDF({
      roi,
      productivity,
      revenueAnalysis,
      performanceOverview
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${Date.now()}.pdf`);
    res.send(buffer);
  } catch (error) {
    console.error('Erreur lors de l\'export PDF analytics:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export', error: error.message });
  }
});

/**
 * POST /api/export/custom
 * Créer un rapport personnalisé
 * Body: { includeLeads, includeProjects, includeRevenues, dateFrom, dateTo }
 */
router.post('/custom', requirePermission('read'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { includeLeads, includeProjects, includeRevenues, dateFrom, dateTo } = req.body;

    const data = {
      summary: {
        generated_at: new Date().toISOString(),
        user_id: userId,
        date_range: dateFrom && dateTo ? `${dateFrom} - ${dateTo}` : 'Toutes les dates'
      }
    };

    // Récupérer les données demandées
    if (includeLeads) {
      data.leads = await leadModel.getAllLeads(userId);
      data.summary.total_leads = data.leads.length;
    }

    if (includeProjects) {
      data.projects = await projectModel.getAllProjects(userId);
      data.summary.total_projects = data.projects.length;
    }

    if (includeRevenues) {
      data.revenues = await revenueModel.getAllRevenues(userId);
      data.summary.total_revenues = data.revenues.length;
      data.summary.total_amount = data.revenues.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    }

    const buffer = await exportCustomReport(data);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=rapport-personnalise-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Erreur lors de la création du rapport personnalisé:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export', error: error.message });
  }
});

module.exports = router;
