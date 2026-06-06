// src/pages/Treasury.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiDollarSign,
  FiTrendingUp,
  FiAlertCircle,
  FiClock,
  FiDownload,
  FiRefreshCw,
  FiCalendar
} from 'react-icons/fi';
import { paymentsAPI } from '../services/api';
import { invoicesAPI } from '../services/quotesAPI';
import { useToast } from '../hooks/useToast';
import Button from '../components/common/Button';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useChartColors } from '../utils/chartTheme';

const Treasury = () => {
  const chartColors = useChartColors();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total_received: 0,
    period_received: 0,
    total_unpaid: 0,
    total_overdue: 0,
    payment_count: 0
  });
  const [chartData, setChartData] = useState([]);
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [period, setPeriod] = useState('30'); // 7, 30, 90 jours

  useEffect(() => {
    fetchTreasuryData();
  }, [period]);

  const fetchTreasuryData = async () => {
    setLoading(true);
    try {
      // Calculer les dates selon la période
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Récupérer les stats
      const statsData = await paymentsAPI.getTreasuryStats(startDate, endDate);
      setStats(statsData);

      // Récupérer les données pour le graphique
      const chartResponse = await paymentsAPI.getChartData(startDate, endDate);

      // Transformer les données pour Recharts
      const formattedChartData = chartResponse.map(item => ({
        date: new Date(item.payment_date).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'short'
        }),
        montant: parseFloat(item.total_amount || 0),
        paiements: parseInt(item.payment_count || 0)
      }));

      setChartData(formattedChartData);

      // Récupérer les factures en retard
      const invoices = await invoicesAPI.getAll();
      const overdue = invoices.filter(inv => inv.payment_status === 'overdue');
      setOverdueInvoices(overdue);

    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      toast.error('Erreur lors du chargement des données de trésorerie');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const exportToCSV = () => {
    // Préparer les données CSV
    const headers = ['Date', 'Montant', 'Nombre de paiements'];
    const rows = chartData.map(item => [
      item.date,
      item.montant,
      item.paiements
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Télécharger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tresorerie_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast.success('Export CSV réussi');
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center py-12 text-gray-400">
            <FiRefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin" />
            <p>Chargement des données de trésorerie...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
      <div className="max-w-7xl mx-auto w-full">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pt-16 sm:pt-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-300 to-emerald-300">
              Trésorerie
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Vue d'ensemble de vos encaissements et impayés
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {/* Sélecteur période */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-green-500"
            >
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
              <option value="90">90 derniers jours</option>
              <option value="365">12 derniers mois</option>
            </select>

            {/* Bouton rafraîchir */}
            <motion.button
              onClick={fetchTreasuryData}
              className="p-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-green-500 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Rafraîchir"
            >
              <FiRefreshCw className="w-5 h-5" />
            </motion.button>

            {/* Bouton export */}
            <Button
              onClick={exportToCSV}
              variant="secondary"
              icon={FiDownload}
              className="w-full sm:w-auto"
            >
              Exporter CSV
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total encaissé */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Total encaissé</span>
              <div className="p-2 bg-green-500/20 rounded-lg">
                <FiDollarSign className="text-green-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">
              {formatAmount(stats.total_received)}
            </p>
            <p className="text-xs text-gray-400">
              {stats.payment_count} paiement{stats.payment_count > 1 ? 's' : ''} reçu{stats.payment_count > 1 ? 's' : ''}
            </p>
          </motion.div>

          {/* Période en cours */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Période sélectionnée</span>
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <FiCalendar className="text-blue-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">
              {formatAmount(stats.period_received)}
            </p>
            <p className="text-xs text-gray-400">
              {period === '7' ? '7 derniers jours' : period === '30' ? '30 derniers jours' : period === '90' ? '90 derniers jours' : '12 derniers mois'}
            </p>
          </motion.div>

          {/* En attente de paiement */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">En attente</span>
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <FiClock className="text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">
              {formatAmount(stats.total_unpaid)}
            </p>
            <p className="text-xs text-gray-400">
              À encaisser
            </p>
          </motion.div>

          {/* En retard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-rose-500/20 to-red-500/20 border border-rose-500/30 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">En retard</span>
              <div className="p-2 bg-rose-500/20 rounded-lg">
                <FiAlertCircle className="text-rose-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">
              {formatAmount(stats.total_overdue)}
            </p>
            <p className="text-xs text-gray-400">
              {overdueInvoices.length} facture{overdueInvoices.length > 1 ? 's' : ''}
            </p>
          </motion.div>
        </div>

        {/* Graphique */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <FiTrendingUp />
            Évolution des encaissements
          </h2>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis
                  dataKey="date"
                  stroke={chartColors.axis}
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke={chartColors.axis}
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => `${value.toLocaleString()}€`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: chartColors.tooltipText }}
                  formatter={(value, name) => {
                    if (name === 'montant') return [formatAmount(value), 'Montant'];
                    return [value, 'Paiements'];
                  }}
                />
                <Legend />
                <Bar dataKey="montant" fill="#10B981" name="Montant encaissé" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <FiTrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun encaissement sur cette période</p>
            </div>
          )}
        </div>

        {/* Factures en retard */}
        {overdueInvoices.length > 0 && (
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-rose-500/30 p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <FiAlertCircle className="text-rose-400" />
              Factures en retard ({overdueInvoices.length})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800/50">
                  <tr className="text-left text-sm text-gray-400">
                    <th className="px-4 py-3">Numéro</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Échéance</th>
                    <th className="px-4 py-3">Retard</th>
                    <th className="px-4 py-3">Montant dû</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {overdueInvoices.map((invoice) => {
                    const dueDate = new Date(invoice.due_date);
                    const today = new Date();
                    const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

                    return (
                      <tr key={invoice.id} className="hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm text-rose-300">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-4 py-3 text-white">{invoice.client_name}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">
                          {formatDate(invoice.due_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300">
                            <FiClock className="w-3 h-3" />
                            {daysOverdue} jour{daysOverdue > 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-rose-400">
                          {formatAmount(invoice.amount_remaining || invoice.total_ttc)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Treasury;
