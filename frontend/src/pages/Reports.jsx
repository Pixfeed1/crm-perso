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
  FiFilter
} from 'react-icons/fi';
import { FaFileExport, FaChartLine } from 'react-icons/fa';
import { dashboardAPI, leadsAPI, clientsAPI, revenuesAPI } from '../services/api';

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
    // Pour l'instant, simuler l'export
    // Dans une vraie application, utiliser une lib comme jsPDF ou html2pdf
    alert(`Export PDF du rapport ${getPeriodLabel()} en cours...\n\nFonctionnalité à implémenter avec jsPDF ou une API backend.`);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">

        {/* ========== HEADER ========== */}
        <div className="mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <FiBarChart2 className="text-white text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Rapports & Analytics</h1>
                <p className="text-gray-400 text-sm">Analyse de performance {getPeriodLabel()}</p>
              </div>
            </div>

            <div className="flex gap-2">
              {/* Sélecteur de période */}
              <div className="flex bg-slate-800/50 backdrop-blur rounded-lg p-1">
                {['month', 'quarter', 'year'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      period === p
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 hover:text-white'
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-slate-700/50">
                  <FiUsers className="text-xl text-blue-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Nouveaux Leads</p>
                <p className="text-3xl font-bold text-white">{reportData.summary.newLeads}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-slate-700/50">
                  <FiTrendingUp className="text-xl text-emerald-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Taux de Conversion</p>
                <p className="text-3xl font-bold text-white">{reportData.leadConversion.conversionRate}%</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-slate-700/50">
                  <FiDollarSign className="text-xl text-purple-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Revenus Totaux</p>
                <p className="text-2xl font-bold text-white">{formatAmount(reportData.summary.totalRevenue)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-60"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-slate-700/50">
                  <FiUsers className="text-xl text-amber-400" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Clients Actifs</p>
                <p className="text-3xl font-bold text-white">{reportData.summary.activeClients}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ========== GRILLE PRINCIPALE ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* CONVERSION LEAD → CLIENT */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <FiTrendingUp className="text-green-400" />
                Conversion Leads
              </h2>
              <div className="text-2xl font-bold text-green-400">
                {reportData.leadConversion.conversionRate}%
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-700/20 rounded-lg">
                <span className="text-gray-300">Total Leads</span>
                <span className="text-white font-semibold">{reportData.leadConversion.totalLeads}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                <span className="text-gray-300">Leads Convertis</span>
                <span className="text-emerald-400 font-semibold">{reportData.leadConversion.convertedLeads}</span>
              </div>

              {/* Répartition par statut */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Répartition par Statut</h3>
                <div className="space-y-2">
                  {reportData.leadConversion.byStatus.map((item, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-300">{getStatusLabel(item.status)}</span>
                        <span className="text-gray-400">{item.count} ({item.percentage}%)</span>
                      </div>
                      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
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
            className="bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
          >
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <FiPieChart className="text-purple-400" />
              Performance par Source
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {reportData.sourcePerformance.map((source, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 bg-slate-700/20 rounded-lg hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-white">{source.source}</span>
                    <span className="text-sm px-2 py-1 bg-purple-500/20 text-purple-300 rounded">
                      {source.conversionRate}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Total: </span>
                      <span className="text-gray-300 font-medium">{source.total}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Convertis: </span>
                      <span className="text-emerald-400 font-medium">{source.converted}</span>
                    </div>
                  </div>
                </motion.div>
              ))}

              {reportData.sourcePerformance.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Aucune donnée de source disponible
                </div>
              )}
            </div>
          </motion.div>

          {/* ÉVOLUTION DES REVENUS */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 lg:col-span-2"
          >
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <FaChartLine className="text-teal-400" />
              Évolution des Revenus
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
                        <span className="font-medium text-gray-300">
                          {new Date(item.month + '-01').toLocaleDateString('fr-FR', {
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                        <span className="font-semibold text-teal-300">{formatAmount(item.amount)}</span>
                      </div>
                      <div className="h-4 bg-slate-700/50 rounded-full overflow-hidden">
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
              <div className="text-center py-12 text-gray-500">
                <FiBarChart2 className="text-5xl mx-auto mb-4 text-gray-600" />
                <p>Aucune donnée de revenus disponible</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Note de bas de page */}
        <div className="mt-6 p-4 bg-slate-800/30 backdrop-blur rounded-lg shadow-xl shadow-black/20">
          <p className="text-sm text-gray-300">
            💡 <strong>Astuce :</strong> Ces rapports sont générés en temps réel à partir de vos données.
            Utilisez le sélecteur de période pour analyser différentes périodes et exportez en PDF pour vos présentations.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Reports;
