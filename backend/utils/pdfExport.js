// backend/utils/pdfExport.js
const PDFDocument = require('pdfkit');

/**
 * Utilitaires pour générer des exports PDF
 */

/**
 * Exporter les statistiques analytics en PDF
 */
async function exportAnalyticsToPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      // Collecter les chunks du PDF
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // En-tête
      doc.fontSize(24)
         .fillColor('#4F46E5')
         .text('Rapport Analytics CRM', { align: 'center' });

      doc.moveDown();
      doc.fontSize(12)
         .fillColor('#6B7280')
         .text(`Date de génération : ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });

      doc.moveDown(2);

      // Section ROI
      if (data.roi && data.roi.summary) {
        addSection(doc, 'ROI par Projet', '#8B5CF6');

        addMetric(doc, 'Revenus Totaux', `${data.roi.summary.total_revenue.toLocaleString('fr-FR')} €`);
        addMetric(doc, 'Coûts Totaux', `${data.roi.summary.total_costs.toLocaleString('fr-FR')} €`);
        addMetric(doc, 'Profit Net', `${data.roi.summary.total_profit.toLocaleString('fr-FR')} €`);
        addMetric(doc, 'ROI Moyen', `${data.roi.summary.average_roi.toFixed(2)} %`);

        doc.moveDown();

        // Top 5 projets
        if (data.roi.projects && data.roi.projects.length > 0) {
          doc.fontSize(14)
             .fillColor('#374151')
             .text('Top 5 Projets par ROI:', { underline: true });
          doc.moveDown(0.5);

          const topProjects = data.roi.projects
            .sort((a, b) => b.roi - a.roi)
            .slice(0, 5);

          topProjects.forEach((project, idx) => {
            doc.fontSize(10)
               .fillColor('#1F2937')
               .text(`${idx + 1}. ${project.project_name}`, { continued: true })
               .fillColor('#10B981')
               .text(` - ROI: ${project.roi.toFixed(2)}%`, { align: 'right' });
            doc.moveDown(0.3);
          });
        }

        doc.moveDown();
      }

      // Section Productivité
      if (data.productivity && data.productivity.summary) {
        addSection(doc, 'Productivité', '#3B82F6');

        addMetric(doc, 'Heures Planifiées', `${data.productivity.summary.total_planned.toFixed(1)} h`);
        addMetric(doc, 'Heures Réelles', `${data.productivity.summary.total_actual.toFixed(1)} h`);
        addMetric(doc, 'Écart', `${data.productivity.summary.total_variance.toFixed(1)} h`);
        addMetric(doc, 'Efficacité', `${(100 - Math.abs(data.productivity.summary.variance_percentage)).toFixed(1)} %`);

        doc.moveDown();
      }

      // Section Revenus
      if (data.revenueAnalysis && data.revenueAnalysis.summary) {
        addSection(doc, 'Analyse des Revenus', '#10B981');

        addMetric(doc, 'Revenus Totaux', `${data.revenueAnalysis.summary.total_revenue.toLocaleString('fr-FR')} €`);
        addMetric(doc, 'Moyenne Mensuelle', `${data.revenueAnalysis.summary.average_monthly.toLocaleString('fr-FR')} €`);
        addMetric(doc, 'Tendance de Croissance', `${data.revenueAnalysis.summary.growth_rate.toFixed(2)} %`);

        if (data.revenueAnalysis.best_month) {
          doc.moveDown(0.5);
          doc.fontSize(12)
             .fillColor('#374151')
             .text('Meilleur Mois:', { continued: true })
             .fillColor('#10B981')
             .text(` ${new Date(data.revenueAnalysis.best_month.month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} - ${data.revenueAnalysis.best_month.total_revenue.toLocaleString('fr-FR')} €`);
        }

        doc.moveDown();
      }

      // Section Performance Globale
      if (data.performanceOverview) {
        addSection(doc, 'Performance Globale', '#EC4899');

        addMetric(doc, 'Score de Santé', `${data.performanceOverview.health_score} / 100`);

        if (data.performanceOverview.metrics) {
          addMetric(doc, 'Projets Actifs', data.performanceOverview.metrics.active_projects);
          addMetric(doc, 'Leads Qualifiés', data.performanceOverview.metrics.qualified_leads);
          addMetric(doc, 'Taux de Conversion', `${data.performanceOverview.metrics.conversion_rate.toFixed(2)} %`);
        }

        // Recommandations
        if (data.performanceOverview.recommendations && data.performanceOverview.recommendations.length > 0) {
          doc.moveDown();
          doc.fontSize(14)
             .fillColor('#374151')
             .text('Recommandations:', { underline: true });
          doc.moveDown(0.5);

          data.performanceOverview.recommendations.forEach((rec, idx) => {
            doc.fontSize(10)
               .fillColor('#1F2937')
               .text(`• ${rec}`);
            doc.moveDown(0.3);
          });
        }
      }

      // Pied de page
      doc.moveDown(2);
      doc.fontSize(8)
         .fillColor('#9CA3AF')
         .text('Généré automatiquement par CRM Audacieux', { align: 'center' });

      // Finaliser le PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Ajouter une section avec titre
 */
function addSection(doc, title, color) {
  doc.fontSize(18)
     .fillColor(color)
     .text(title, { underline: true });
  doc.moveDown();
}

/**
 * Ajouter une métrique
 */
function addMetric(doc, label, value) {
  doc.fontSize(12)
     .fillColor('#374151')
     .text(label, { continued: true })
     .fillColor('#1F2937')
     .text(`: ${value}`, { align: 'right' });
  doc.moveDown(0.3);
}

/**
 * Exporter un rapport de leads en PDF
 */
async function exportLeadsToPDF(leads) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // En-tête
      doc.fontSize(24)
         .fillColor('#4F46E5')
         .text('Rapport Leads', { align: 'center' });

      doc.moveDown();
      doc.fontSize(12)
         .fillColor('#6B7280')
         .text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
      doc.text(`Nombre total de leads : ${leads.length}`, { align: 'center' });

      doc.moveDown(2);

      // Statistiques par statut
      const statusCount = {};
      leads.forEach(lead => {
        statusCount[lead.status] = (statusCount[lead.status] || 0) + 1;
      });

      doc.fontSize(16)
         .fillColor('#374151')
         .text('Répartition par Statut', { underline: true });
      doc.moveDown(0.5);

      Object.entries(statusCount).forEach(([status, count]) => {
        doc.fontSize(12)
           .fillColor('#1F2937')
           .text(`${status}`, { continued: true })
           .text(`: ${count}`, { align: 'right' });
        doc.moveDown(0.3);
      });

      doc.moveDown();

      // Liste des leads (premiers 20)
      doc.fontSize(16)
         .fillColor('#374151')
         .text('Leads Récents (20 premiers)', { underline: true });
      doc.moveDown(0.5);

      leads.slice(0, 20).forEach(lead => {
        doc.fontSize(11)
           .fillColor('#1F2937')
           .text(lead.name, { continued: true })
           .fontSize(9)
           .fillColor('#6B7280')
           .text(` - ${lead.company || 'N/A'} - ${lead.status}`, { align: 'right' });
        doc.moveDown(0.2);
      });

      // Pied de page
      doc.moveDown(2);
      doc.fontSize(8)
         .fillColor('#9CA3AF')
         .text('CRM Audacieux', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  exportAnalyticsToPDF,
  exportLeadsToPDF
};
