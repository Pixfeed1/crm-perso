// src/components/exports/ExportButtons.jsx
import React from 'react';
import ExportButton from './ExportButton';
import { FiDownload } from 'react-icons/fi';

/**
 * Groupe de boutons d'export pour les différentes pages
 */

// Boutons pour la page Leads
export const LeadsExportButtons = () => (
  <div className="flex gap-2">
    <ExportButton
      type="excel"
      endpoint="/api/export/leads/excel"
      filename="leads.xlsx"
      label="Excel"
    />
    <ExportButton
      type="pdf"
      endpoint="/api/export/leads/pdf"
      filename="leads.pdf"
      label="PDF"
    />
  </div>
);

// Boutons pour la page Projects
export const ProjectsExportButtons = () => (
  <div className="flex gap-2">
    <ExportButton
      type="excel"
      endpoint="/api/export/projects/excel"
      filename="projects.xlsx"
      label="Excel"
    />
  </div>
);

// Boutons pour la page Revenues
export const RevenuesExportButtons = () => (
  <div className="flex gap-2">
    <ExportButton
      type="excel"
      endpoint="/api/export/revenues/excel"
      filename="revenues.xlsx"
      label="Excel"
    />
  </div>
);

// Boutons pour la page Analytics
export const AnalyticsExportButtons = () => (
  <div className="flex gap-2">
    <ExportButton
      type="pdf"
      endpoint="/api/export/analytics/pdf"
      filename="analytics.pdf"
      label="Exporter PDF"
      icon={FiDownload}
    />
  </div>
);

export default {
  LeadsExportButtons,
  ProjectsExportButtons,
  RevenuesExportButtons,
  AnalyticsExportButtons
};
