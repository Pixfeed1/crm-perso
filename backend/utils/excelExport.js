// backend/utils/excelExport.js
const ExcelJS = require('exceljs');

/**
 * Utilitaires pour générer des exports Excel
 */

/**
 * Exporter les leads en Excel
 */
async function exportLeadsToExcel(leads) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Leads');

  // Définir les colonnes
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Nom', key: 'name', width: 25 },
    { header: 'Entreprise', key: 'company', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Téléphone', key: 'phone', width: 20 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Statut', key: 'status', width: 20 },
    { header: 'Source', key: 'source', width: 20 },
    { header: 'Date de création', key: 'created_at', width: 20 }
  ];

  // Styliser l'en-tête
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F46E5' }
  };

  // Ajouter les données
  leads.forEach(lead => {
    worksheet.addRow({
      id: lead.id,
      name: lead.name,
      company: lead.company || '-',
      email: lead.email || '-',
      phone: lead.phone || '-',
      type: lead.type,
      status: lead.status,
      source: lead.source || '-',
      created_at: lead.created_at ? new Date(lead.created_at).toLocaleDateString('fr-FR') : '-'
    });
  });

  // Appliquer un filtre automatique
  worksheet.autoFilter = {
    from: 'A1',
    to: `I${leads.length + 1}`
  };

  // Retourner le buffer
  return await workbook.xlsx.writeBuffer();
}

/**
 * Exporter les projets en Excel
 */
async function exportProjectsToExcel(projects) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Projets');

  // Définir les colonnes
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Nom', key: 'name', width: 30 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Statut', key: 'status', width: 20 },
    { header: 'Montant (€)', key: 'amount', width: 15 },
    { header: 'Progression (%)', key: 'progress', width: 15 },
    { header: 'Date début', key: 'start_date', width: 20 },
    { header: 'Date fin', key: 'end_date', width: 20 },
    { header: 'Lead associé', key: 'lead_name', width: 25 }
  ];

  // Styliser l'en-tête
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF8B5CF6' }
  };

  // Ajouter les données
  projects.forEach(project => {
    worksheet.addRow({
      id: project.id,
      name: project.name,
      type: project.type || '-',
      description: project.description || '-',
      status: project.status,
      amount: project.amount || 0,
      progress: project.progress || 0,
      start_date: project.start_date ? new Date(project.start_date).toLocaleDateString('fr-FR') : '-',
      end_date: project.end_date ? new Date(project.end_date).toLocaleDateString('fr-FR') : '-',
      lead_name: project.lead_name || '-'
    });
  });

  // Appliquer un filtre automatique
  worksheet.autoFilter = {
    from: 'A1',
    to: `J${projects.length + 1}`
  };

  // Retourner le buffer
  return await workbook.xlsx.writeBuffer();
}

/**
 * Exporter les revenus en Excel
 */
async function exportRevenuesToExcel(revenues) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Revenus');

  // Définir les colonnes
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Montant (€)', key: 'amount', width: 15 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Source', key: 'source', width: 25 },
    { header: 'Statut', key: 'status', width: 20 },
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Méthode paiement', key: 'payment_method', width: 25 },
    { header: 'Projet associé', key: 'project_name', width: 30 }
  ];

  // Styliser l'en-tête
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF10B981' }
  };

  // Ajouter les données
  let totalAmount = 0;
  revenues.forEach(revenue => {
    worksheet.addRow({
      id: revenue.id,
      amount: revenue.amount || 0,
      description: revenue.description || '-',
      source: revenue.source || '-',
      status: revenue.status,
      date: revenue.date ? new Date(revenue.date).toLocaleDateString('fr-FR') : '-',
      payment_method: revenue.payment_method || '-',
      project_name: revenue.project_name || '-'
    });
    totalAmount += parseFloat(revenue.amount || 0);
  });

  // Ajouter une ligne de total
  const totalRow = worksheet.addRow({
    id: '',
    amount: totalAmount,
    description: 'TOTAL',
    source: '',
    status: '',
    date: '',
    payment_method: '',
    project_name: ''
  });
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }
  };

  // Appliquer un filtre automatique
  worksheet.autoFilter = {
    from: 'A1',
    to: `H${revenues.length + 1}`
  };

  // Retourner le buffer
  return await workbook.xlsx.writeBuffer();
}

/**
 * Exporter un rapport personnalisé avec statistiques
 */
async function exportCustomReport(data) {
  const workbook = new ExcelJS.Workbook();

  // Feuille de résumé
  const summarySheet = workbook.addWorksheet('Résumé');
  summarySheet.columns = [
    { header: 'Métrique', key: 'metric', width: 30 },
    { header: 'Valeur', key: 'value', width: 20 }
  ];

  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF6366F1' }
  };

  // Ajouter les métriques
  if (data.summary) {
    Object.entries(data.summary).forEach(([key, value]) => {
      summarySheet.addRow({
        metric: key.replace(/_/g, ' ').toUpperCase(),
        value: typeof value === 'number' ? value.toLocaleString('fr-FR') : value
      });
    });
  }

  // Feuilles additionnelles selon les données
  if (data.leads) {
    const leadsBuffer = await exportLeadsToExcel(data.leads);
    // Note: on pourrait ajouter cette feuille au workbook existant
  }

  if (data.projects) {
    const projectsBuffer = await exportProjectsToExcel(data.projects);
  }

  if (data.revenues) {
    const revenuesBuffer = await exportRevenuesToExcel(data.revenues);
  }

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  exportLeadsToExcel,
  exportProjectsToExcel,
  exportRevenuesToExcel,
  exportCustomReport
};
