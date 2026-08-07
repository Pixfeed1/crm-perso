// src/pages/Reports.jsx - Page Rapports et Analytics
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiDownload,
  FiTrendingUp,
  FiUsers,
  FiDollarSign,
  FiPieChart,
  FiBarChart2,
  FiCalendar,
  FiFilter,
  FiInfo
} from 'react-icons/fi';
import { FaFileExport, FaChartLine } from 'react-icons/fa';
import { dashboardAPI, leadsAPI, clientsAPI, revenuesAPI } from '../services/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports = () => {
  const [period, setPeriod] = useState('month'); // month, quarter, year
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState({
    leadConversion: {
      totalLeads: 0,
      convertedLeads: 0,
      conversionRate: 0,
      byStatus: []
    },
    revenueEvolution: [],
    sourcePerformance: [],
    summary: {
      totalRevenue: 0,
      activeClients: 0,
      newLeads: 0,
      projectsCompleted: 0
    }
  });

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // Récupérer les données depuis l'API
      const [leads, clients, dashboardData] = await Promise.all([
        leadsAPI.getAll(),
        clientsAPI.getAll(),
        dashboardAPI.getData()
      ]);

      // Calculer le taux de conversion Lead → Client
      const totalLeads = leads.length;
      const convertedLeads = leads.filter(lead => lead.status === 'won' || lead.status === 'client').length;
      const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0;

      // Grouper leads par statut
      const statusGroups = leads.reduce((acc, lead) => {
        const status = lead.status || 'nouveau';
        if (!acc[status]) {
          acc[status] = { status, count: 0, percentage: 0 };
        }
        acc[status].count++;
        return acc;
      }, {});

      const byStatus = Object.values(statusGroups).map(group => ({
        ...group,
        percentage: totalLeads > 0 ? ((group.count / totalLeads) * 100).toFixed(1) : 0
      }));

      // Performance par source
      const sourceGroups = leads.reduce((acc, lead) => {
        const source = lead.source || 'Non spécifié';
        if (!acc[source]) {
          acc[source] = {
            source,
            total: 0,
            converted: 0,
            conversionRate: 0
          };
        }
        acc[source].total++;
        if (lead.status === 'won' || lead.status === 'client') {
          acc[source].converted++;
        }
        return acc;
      }, {});

      const sourcePerformance = Object.values(sourceGroups).map(group => ({
        ...group,
        conversionRate: group.total > 0 ? ((group.converted / group.total) * 100).toFixed(1) : 0
      })).sort((a, b) => b.total - a.total);

      // Évolution des revenus (simulé pour l'exemple)
      const revenueEvolution = dashboardData.revenueChart || [];

      setReportData({
        leadConversion: {
          totalLeads,
          convertedLeads,
          conversionRate,
          byStatus
        },
        revenueEvolution,
        sourcePerformance,
        summary: {
          totalRevenue: dashboardData.revenues?.total || 0,
          activeClients: clients.filter(c => c.status === 'active').length,
          newLeads: dashboardData.leads?.newThisMonth || 0,
          projectsCompleted: dashboardData.projects?.completed || 0
        }
      });
    } catch (error) {
      console.error('Erreur lors du chargement des rapports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    try {
      // S'assurer que autoTable est bien chargé
      if (typeof autoTable !== 'function') {
        console.error('jspdf-autotable n\'est pas chargé correctement');
        alert('Erreur: Le module d\'export PDF n\'est pas disponible. Veuillez recharger la page.');
        return;
      }

      const doc = new jsPDF();

      // Vérifier que autoTable est disponible sur l'instance
      if (typeof doc.autoTable !== 'function') {
        console.error('doc.autoTable n\'est pas une fonction');
        alert('Erreur: La fonction autoTable n\'est pas disponible. Veuillez recharger la page.');
        return;
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // En-tête du document
      doc.setFillColor(139, 92, 246); // Purple
      doc.rect(0, 0, pageWidth, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('Rapport Analytics', pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Période: ${getPeriodLabel()}`, pageWidth / 2, 30, { align: 'center' });

      // Date de génération
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      const today = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      doc.text(`Généré le ${today}`, pageWidth / 2, 37, { align: 'center' });

      let yPos = 50;

      // Section 1: Résumé KPIs
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Résumé des Indicateurs Clés', 14, yPos);
      yPos += 10;

      const kpiData = [
        ['Indicateur', 'Valeur'],
        ['Nouveaux Leads', reportData.summary.newLeads.toString()],
        ['Taux de Conversion', `${reportData.leadConversion.conversionRate}%`],
        ['Revenus Totaux', formatAmount(reportData.summary.totalRevenue)],
        ['Clients Actifs', reportData.summary.activeClients.toString()]
      ];

      doc.autoTable({
        startY: yPos,
        head: [kpiData[0]],
        body: kpiData.slice(1),
        theme: 'grid',
        headStyles: {
          fillColor: [139, 92, 246],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 10,
          cellPadding: 5
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 100 },
          1: { halign: 'right', cellWidth: 80 }
        }
      });

      yPos = doc.lastAutoTable.finalY + 15;

      // Section 2: Conversion Leads
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Analyse de Conversion des Leads', 14, yPos);
      yPos += 10;

      const conversionData = [
        ['Statut', 'Nombre', 'Pourcentage'],
        ...reportData.leadConversion.byStatus.map(item => [
          getStatusLabel(item.status),
          item.count.toString(),
          `${item.percentage}%`
        ])
      ];

      if (conversionData.length > 1) {
        doc.autoTable({
          startY: yPos,
          head: [conversionData[0]],
          body: conversionData.slice(1),
          theme: 'striped',
          headStyles: {
            fillColor: [16, 185, 129],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 10,
            cellPadding: 5
          },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { halign: 'center', cellWidth: 50 },
            2: { halign: 'center', cellWidth: 50 }
          }
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // Section 3: Performance par Source
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Performance par Source', 14, yPos);
      yPos += 10;

      const sourceData = [
        ['Source', 'Total', 'Convertis', 'Taux'],
        ...reportData.sourcePerformance.map(source => [
          source.source,
          source.total.toString(),
          source.converted.toString(),
          `${source.conversionRate}%`
        ])
      ];

      if (sourceData.length > 1) {
        doc.autoTable({
          startY: yPos,
          head: [sourceData[0]],
          body: sourceData.slice(1),
          theme: 'striped',
          headStyles: {
            fillColor: [168, 85, 247],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 10,
            cellPadding: 5
          },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { halign: 'center', cellWidth: 35 },
            2: { halign: 'center', cellWidth: 40 },
            3: { halign: 'center', cellWidth: 35 }
          }
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // Section 4: Évolution des Revenus
      if (reportData.revenueEvolution && reportData.revenueEvolution.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Évolution des Revenus (6 derniers mois)', 14, yPos);
        yPos += 10;

        const revenueData = [
          ['Mois', 'Montant'],
          ...reportData.revenueEvolution.map(item => [
            new Date(item.month + '-01').toLocaleDateString('fr-FR', {
              month: 'long',
              year: 'numeric'
            }),
            formatAmount(item.amount)
          ])
        ];

        doc.autoTable({
          startY: yPos,
          head: [revenueData[0]],
          body: revenueData.slice(1),
          theme: 'grid',
          headStyles: {
            fillColor: [20, 184, 166],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 10,
            cellPadding: 5
          },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { halign: 'right', cellWidth: 80 }
          }
        });
      }

      // Pied de page sur toutes les pages
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} sur ${totalPages} - CRM Analytics`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      // Sauvegarder le PDF
      const fileName = `Rapport_${getPeriodLabel()}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`;
      doc.save(fileName);

    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      alert('Erreur lors de la génération du PDF. Veuillez réessayer.');
    }
  };

  const getPeriodLabel = () => {
    switch(period) {
      case 'month': return 'Mensuel';
      case 'quarter': return 'Trimestriel';
      case 'year': return 'Annuel';
      default: return 'Mensuel';
    }
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusLabel = (status) => {
    const labels = {
      'nouveau': 'Nouveau',
      'prospect': 'Prospect',
      'qualifié': 'Qualifié',
      'négociation': 'Négociation',
      'won': 'Gagné',
      'client': 'Client',
      'perdu': 'Perdu'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      'nouveau': 'bg-blue-500',
      'prospect': 'bg-purple-500',
      'qualifié': 'bg-indigo-500',
      'négociation': 'bg-amber-500',
      'won': 'bg-green-500',
      'client': 'bg-emerald-500',
      'perdu': 'bg-red-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-indigo-200">Génération des rapports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
      <div className="max-w-7xl mx-auto w-full">

        {/* ========== HEADER ========== */}
        <div className="mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <FiBarChart2 className="text-text-primary text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">Rapports & Analytics</h1>
                <p className="text-text-muted text-sm">Analyse de performance {getPeriodLabel()}</p>
              </div>
            </div>

            <div className="flex gap-2">
              {/* Sélecteur de période */}
              <div className="flex bg-surface/50 backdrop-blur rounded-lg p-1">
                {['month', 'quarter', 'year'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      period === p
                        ? 'bg-accent text-white'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {p === 'month' ? 'Mois' : p === 'quarter' ? 'Trimestre' : 'Année'}
                  </button>
                ))}
              </div>

              {/* Bouton Export PDF */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleExportPDF}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <FiDownload />
                <span className="hidden sm:inline">Export PDF</span>
              </motion.button>
            </div>
          </div>
        </div>

        {/* ========== RÉSUMÉ KPIs ========== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-2.5 rounded-xl bg-surface-strong/50">
                  <FiUsers className="text-lg sm:text-xl text-blue-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-text-muted">Nouveaux Leads</p>
                <p className="text-2xl sm:text-3xl font-bold text-text-primary">{reportData.summary.newLeads}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-2.5 rounded-xl bg-surface-strong/50">
                  <FiTrendingUp className="text-lg sm:text-xl text-emerald-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-text-muted">Taux de Conversion</p>
                <p className="text-2xl sm:text-3xl font-bold text-text-primary">{reportData.leadConversion.conversionRate}%</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-2.5 rounded-xl bg-surface-strong/50">
                  <FiDollarSign className="text-lg sm:text-xl text-purple-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-text-muted">Revenus Totaux</p>
                <p className="text-xl sm:text-2xl font-bold text-text-primary">{formatAmount(reportData.summary.totalRevenue)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="p-2 sm:p-2.5 rounded-xl bg-surface-strong/50">
                  <FiUsers className="text-lg sm:text-xl text-amber-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-text-muted">Clients Actifs</p>
                <p className="text-2xl sm:text-3xl font-bold text-text-primary">{reportData.summary.activeClients}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ========== GRILLE PRINCIPALE ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* CONVERSION LEAD → CLIENT */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20"
          >
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-semibold text-text-primary flex items-center gap-2">
                <FiTrendingUp className="text-green-400" />
                <span className="hidden sm:inline">Conversion Leads</span>
                <span className="sm:hidden">Conversion</span>
              </h2>
              <div className="text-xl sm:text-2xl font-bold text-green-400">
                {reportData.leadConversion.conversionRate}%
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-surface-strong/20 rounded-lg">
                <span className="text-text-secondary">Total Leads</span>
                <span className="text-text-primary font-semibold">{reportData.leadConversion.totalLeads}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                <span className="text-text-secondary">Leads Convertis</span>
                <span className="text-emerald-400 font-semibold">{reportData.leadConversion.convertedLeads}</span>
              </div>

              {/* Répartition par statut */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-text-muted mb-3">Répartition par Statut</h3>
                <div className="space-y-2">
                  {reportData.leadConversion.byStatus.map((item, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">{getStatusLabel(item.status)}</span>
                        <span className="text-text-muted">{item.count} ({item.percentage}%)</span>
                      </div>
                      <div className="h-2 bg-surface-strong/50 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.percentage}%` }}
                          transition={{ duration: 1, delay: index * 0.1 }}
                          className={`h-full ${getStatusColor(item.status)}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* PERFORMANCE PAR SOURCE */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20"
          >
            <h2 className="text-lg sm:text-xl font-semibold text-text-primary mb-4 sm:mb-6 flex items-center gap-2">
              <FiPieChart className="text-purple-400" />
              <span className="hidden sm:inline">Performance par Source</span>
              <span className="sm:hidden">Performance</span>
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {reportData.sourcePerformance.map((source, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 bg-surface-strong/20 rounded-lg hover:bg-surface-strong/30 transition-colors"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-text-primary">{source.source}</span>
                    <span className="text-sm px-2 py-1 bg-purple-500/20 text-purple-300 rounded">
                      {source.conversionRate}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-text-muted">Total: </span>
                      <span className="text-text-secondary font-medium">{source.total}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Convertis: </span>
                      <span className="text-emerald-400 font-medium">{source.converted}</span>
                    </div>
                  </div>
                </motion.div>
              ))}

              {reportData.sourcePerformance.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  Aucune donnée de source disponible
                </div>
              )}
            </div>
          </motion.div>

          {/* ÉVOLUTION DES REVENUS */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20 lg:col-span-2"
          >
            <h2 className="text-lg sm:text-xl font-semibold text-text-primary mb-4 sm:mb-6 flex items-center gap-2">
              <FaChartLine className="text-teal-400" />
              <span className="hidden sm:inline">Évolution des Revenus</span>
              <span className="sm:hidden">Revenus</span>
            </h2>

            {reportData.revenueEvolution && reportData.revenueEvolution.length > 0 ? (
              <div className="space-y-3">
                {reportData.revenueEvolution.map((item, index) => {
                  const maxAmount = Math.max(...reportData.revenueEvolution.map(i => i.amount));
                  const percentage = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="space-y-1"
                    >
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-text-secondary">
                          {new Date(item.month + '-01').toLocaleDateString('fr-FR', {
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                        <span className="font-semibold text-teal-300">{formatAmount(item.amount)}</span>
                      </div>
                      <div className="h-4 bg-surface-strong/50 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1, delay: index * 0.05 }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-text-muted">
                <FiBarChart2 className="text-5xl mx-auto mb-4 text-gray-600" />
                <p>Aucune donnée de revenus disponible</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Note de bas de page */}
        <div className="mt-6 p-4 bg-surface/30 backdrop-blur rounded-lg shadow-xl shadow-black/20">
          <p className="text-sm text-text-secondary flex items-start gap-2">
            <FiInfo className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <span><strong>Astuce :</strong> Ces rapports sont générés en temps réel à partir de vos données.
            Utilisez le sélecteur de période pour analyser différentes périodes et exportez en PDF pour vos présentations.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Reports;
