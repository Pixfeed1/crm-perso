// src/pages/Analytics.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar
} from 'recharts';
import {
  FiDollarSign,
  FiClock,
  FiTrendingUp,
  FiActivity,
  FiAlertCircle,
  FiCheckCircle,
  FiTarget,
  FiZap,
  FiBarChart2,
  FiPieChart,
  FiUsers,
  FiBriefcase
} from 'react-icons/fi';

/**
 * Page Analytics - Dashboard des statistiques avancées
 * 4 sections : ROI, Productivité, Revenus, Performance Globale
 */
const Analytics = () => {
  const [activeTab, setActiveTab] = useState('roi');
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState({
    roi: null,
    productivity: null,
    revenueAnalysis: null,
    performanceOverview: null
  });

  // Charger toutes les données au montage
  useEffect(() => {
    fetchAllAnalytics();
  }, []);

  const fetchAllAnalytics = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const [roiRes, productivityRes, revenueRes, performanceRes] = await Promise.all([
        fetch('http://localhost:5000/api/stats/roi-by-project', { headers }),
        fetch('http://localhost:5000/api/stats/productivity', { headers }),
        fetch('http://localhost:5000/api/stats/revenue-analysis', { headers }),
        fetch('http://localhost:5000/api/stats/performance-overview', { headers })
      ]);

      const [roi, productivity, revenueAnalysis, performanceOverview] = await Promise.all([
        roiRes.ok ? roiRes.json() : null,
        productivityRes.ok ? productivityRes.json() : null,
        revenueRes.ok ? revenueRes.json() : null,
        performanceRes.ok ? performanceRes.json() : null
      ]);

      setData({ roi, productivity, revenueAnalysis, performanceOverview });
    } catch (error) {
      console.error('Erreur lors du chargement des analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'roi', label: 'ROI Projets', icon: <FiDollarSign /> },
    { id: 'productivity', label: 'Productivité', icon: <FiClock /> },
    { id: 'revenue', label: 'Revenus', icon: <FiTrendingUp /> },
    { id: 'performance', label: 'Performance', icon: <FiActivity /> }
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 mb-2">
          Analytics Avancés
        </h1>
        <p className="text-gray-400">
          Analyses stratégiques et indicateurs de performance
        </p>
      </motion.div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            icon={tab.icon}
            label={tab.label}
          />
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingState />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'roi' && <ROIView data={data.roi} />}
              {activeTab === 'productivity' && <ProductivityView data={data.productivity} />}
              {activeTab === 'revenue' && <RevenueView data={data.revenueAnalysis} />}
              {activeTab === 'performance' && <PerformanceView data={data.performanceOverview} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

/**
 * Bouton d'onglet
 */
const TabButton = ({ active, onClick, icon, label }) => (
  <motion.button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all whitespace-nowrap ${
      active
        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
        : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
    }`}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </motion.button>
);

/**
 * État de chargement
 */
const LoadingState = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-400">Chargement des analytics...</p>
    </div>
  </div>
);

/**
 * Carte de statistique réutilisable
 */
const StatCard = ({ label, value, subtitle, icon, color = 'indigo' }) => {
  const colorConfig = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    rose: 'from-rose-500 to-pink-500',
    amber: 'from-amber-500 to-orange-500',
    blue: 'from-blue-500 to-cyan-500'
  };

  return (
    <motion.div
      className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700"
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-gray-400 text-sm">{label}</span>
        <div className={`p-2 rounded-lg bg-gradient-to-br ${colorConfig[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      {subtitle && <div className="text-sm text-gray-400">{subtitle}</div>}
    </motion.div>
  );
};

/**
 * Vue ROI par projet
 */
const ROIView = ({ data }) => {
  if (!data || !data.projects || data.projects.length === 0) {
    return <EmptyState message="Aucune donnée ROI disponible" />;
  }

  const { projects, summary } = data;

  // Trier par ROI décroissant
  const sortedProjects = [...projects].sort((a, b) => b.roi - a.roi);

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Revenus Totaux"
          value={`${summary.total_revenue.toLocaleString()}€`}
          icon={<FiDollarSign className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          label="Coûts Totaux"
          value={`${summary.total_costs.toLocaleString()}€`}
          icon={<FiDollarSign className="w-5 h-5" />}
          color="rose"
        />
        <StatCard
          label="Profit Net"
          value={`${summary.total_profit.toLocaleString()}€`}
          icon={<FiTrendingUp className="w-5 h-5" />}
          color="indigo"
        />
        <StatCard
          label="ROI Moyen"
          value={`${summary.average_roi.toFixed(1)}%`}
          icon={<FiBarChart2 className="w-5 h-5" />}
          color="blue"
        />
      </div>

      {/* Graphique ROI par projet */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FiBarChart2 className="text-indigo-400" />
          ROI par Projet
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={sortedProjects}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="project_name"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#fff'
              }}
              formatter={(value) => `${value.toFixed(2)}%`}
            />
            <Legend />
            <Bar dataKey="roi" fill="#8b5cf6" name="ROI %" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Tableau détaillé */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-xl font-bold text-white mb-4">Détails par Projet</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Projet</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Revenus</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Coûts</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Profit</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((project, idx) => (
                <motion.tr
                  key={project.project_id}
                  className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <td className="py-3 px-4 text-white">{project.project_name}</td>
                  <td className="py-3 px-4 text-right text-emerald-400">
                    {project.revenue.toLocaleString()}€
                  </td>
                  <td className="py-3 px-4 text-right text-rose-400">
                    {project.costs.toLocaleString()}€
                  </td>
                  <td className="py-3 px-4 text-right text-blue-400">
                    {project.profit.toLocaleString()}€
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`px-2 py-1 rounded ${
                        project.roi > 50
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : project.roi > 0
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {project.roi.toFixed(1)}%
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

/**
 * Vue Productivité
 */
const ProductivityView = ({ data }) => {
  if (!data || !data.by_type || data.by_type.length === 0) {
    return <EmptyState message="Aucune donnée de productivité disponible" />;
  }

  const { summary, by_type } = data;

  // Préparer les données pour le graphique
  const chartData = by_type.map(item => ({
    type: item.activity_type,
    planifié: parseFloat(item.planned_hours),
    réel: parseFloat(item.actual_hours),
    écart: parseFloat(item.variance)
  }));

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Heures Planifiées"
          value={`${summary.total_planned.toFixed(1)}h`}
          icon={<FiClock className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="Heures Réelles"
          value={`${summary.total_actual.toFixed(1)}h`}
          icon={<FiClock className="w-5 h-5" />}
          color="indigo"
        />
        <StatCard
          label="Écart Total"
          value={`${summary.total_variance.toFixed(1)}h`}
          subtitle={`${summary.variance_percentage.toFixed(1)}%`}
          icon={<FiActivity className="w-5 h-5" />}
          color={summary.total_variance > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Efficacité"
          value={`${(100 - Math.abs(summary.variance_percentage)).toFixed(1)}%`}
          icon={<FiTarget className="w-5 h-5" />}
          color="emerald"
        />
      </div>

      {/* Graphique Planifié vs Réel */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FiClock className="text-indigo-400" />
          Temps Planifié vs Réel par Type d'Activité
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="type"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af' }}
            />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#fff'
              }}
              formatter={(value) => `${value.toFixed(1)}h`}
            />
            <Legend />
            <Bar dataKey="planifié" fill="#3b82f6" name="Planifié" radius={[8, 8, 0, 0]} />
            <Bar dataKey="réel" fill="#8b5cf6" name="Réel" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Graphique des écarts */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FiActivity className="text-amber-400" />
          Écarts par Type d'Activité
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="type" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#fff'
              }}
              formatter={(value) => `${value.toFixed(1)}h`}
            />
            <Bar
              dataKey="écart"
              fill="#f59e0b"
              name="Écart (h)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
};

/**
 * Vue Analyse des Revenus
 */
const RevenueView = ({ data }) => {
  if (!data || !data.monthly_trend || data.monthly_trend.length === 0) {
    return <EmptyState message="Aucune donnée de revenus disponible" />;
  }

  const { summary, monthly_trend, best_month, worst_month } = data;

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Revenus Totaux"
          value={`${summary.total_revenue.toLocaleString()}€`}
          icon={<FiDollarSign className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          label="Moyenne Mensuelle"
          value={`${summary.average_monthly.toLocaleString()}€`}
          icon={<FiTrendingUp className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="Meilleur Mois"
          value={`${best_month.total_revenue.toLocaleString()}€`}
          subtitle={new Date(best_month.month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          icon={<FiCheckCircle className="w-5 h-5" />}
          color="indigo"
        />
        <StatCard
          label="Tendance"
          value={summary.growth_rate >= 0 ? `+${summary.growth_rate.toFixed(1)}%` : `${summary.growth_rate.toFixed(1)}%`}
          subtitle="Croissance"
          icon={<FiTrendingUp className="w-5 h-5" />}
          color={summary.growth_rate >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      {/* Graphique de tendance */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FiTrendingUp className="text-emerald-400" />
          Évolution des Revenus Mensuels
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={monthly_trend}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="month"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af' }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('fr-FR', { month: 'short' })}
            />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#fff'
              }}
              labelFormatter={(value) => new Date(value).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              formatter={(value) => [`${value.toLocaleString()}€`, 'Revenus']}
            />
            <Area
              type="monotone"
              dataKey="total_revenue"
              stroke="#10b981"
              strokeWidth={3}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Comparaison meilleur/pire mois */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 backdrop-blur-sm rounded-xl p-6 border border-emerald-500/20"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <FiCheckCircle className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-300">Meilleur Mois</h3>
              <p className="text-sm text-gray-400">
                {new Date(best_month.month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-2">
            {best_month.total_revenue.toLocaleString()}€
          </div>
          <div className="text-sm text-gray-400">
            {best_month.transaction_count} transaction{best_month.transaction_count > 1 ? 's' : ''}
          </div>
        </motion.div>

        <motion.div
          className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 backdrop-blur-sm rounded-xl p-6 border border-rose-500/20"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-rose-500/20 rounded-lg">
              <FiAlertCircle className="w-6 h-6 text-rose-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-rose-300">Mois le Plus Faible</h3>
              <p className="text-sm text-gray-400">
                {new Date(worst_month.month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-2">
            {worst_month.total_revenue.toLocaleString()}€
          </div>
          <div className="text-sm text-gray-400">
            {worst_month.transaction_count} transaction{worst_month.transaction_count > 1 ? 's' : ''}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

/**
 * Vue Performance Globale avec Score de Santé
 */
const PerformanceView = ({ data }) => {
  if (!data) {
    return <EmptyState message="Aucune donnée de performance disponible" />;
  }

  const { health_score, metrics, recommendations } = data;

  // Déterminer la couleur du score
  const getScoreColor = (score) => {
    if (score >= 80) return { color: 'emerald', label: 'Excellent' };
    if (score >= 60) return { color: 'blue', label: 'Bon' };
    if (score >= 40) return { color: 'amber', label: 'Moyen' };
    return { color: 'rose', label: 'Faible' };
  };

  const scoreInfo = getScoreColor(health_score);

  // Données pour le graphique radial
  const radialData = [
    {
      name: 'Score',
      value: health_score,
      fill: scoreInfo.color === 'emerald' ? '#10b981' :
            scoreInfo.color === 'blue' ? '#3b82f6' :
            scoreInfo.color === 'amber' ? '#f59e0b' : '#ef4444'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Score de Santé Global */}
      <motion.div
        className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-700"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <h3 className="text-2xl font-bold text-white mb-6 text-center">
          Score de Santé Global
        </h3>
        <div className="flex flex-col md:flex-row items-center justify-center gap-8">
          {/* Graphique radial */}
          <div className="relative">
            <ResponsiveContainer width={250} height={250}>
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={radialData}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={10}
                  fill={radialData[0].fill}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-5xl font-bold text-white">{health_score}</div>
              <div className={`text-lg font-medium text-${scoreInfo.color}-400`}>
                {scoreInfo.label}
              </div>
            </div>
          </div>

          {/* Métriques détaillées */}
          <div className="grid grid-cols-2 gap-4">
            <MetricBadge
              label="Projets Actifs"
              value={metrics.active_projects}
              icon={<FiBriefcase />}
              color="blue"
            />
            <MetricBadge
              label="Leads Qualifiés"
              value={metrics.qualified_leads}
              icon={<FiUsers />}
              color="purple"
            />
            <MetricBadge
              label="Taux Conversion"
              value={`${metrics.conversion_rate.toFixed(1)}%`}
              icon={<FiTrendingUp />}
              color="emerald"
            />
            <MetricBadge
              label="Objectifs Atteints"
              value={`${metrics.goals_on_track}/${metrics.total_goals}`}
              icon={<FiTarget />}
              color="indigo"
            />
          </div>
        </div>
      </motion.div>

      {/* Recommandations */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FiZap className="text-amber-400" />
          Recommandations Stratégiques
        </h3>
        <div className="space-y-3">
          {recommendations && recommendations.length > 0 ? (
            recommendations.map((rec, idx) => (
              <motion.div
                key={idx}
                className="flex items-start gap-3 p-4 bg-gray-700/30 rounded-lg"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="p-2 bg-amber-500/20 rounded-lg flex-shrink-0">
                  <FiAlertCircle className="w-5 h-5 text-amber-300" />
                </div>
                <div className="flex-1">
                  <p className="text-white">{rec}</p>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <FiCheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-300">
                Excellente performance ! Continuez sur cette lancée.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

/**
 * Badge de métrique
 */
const MetricBadge = ({ label, value, icon, color = 'indigo' }) => {
  const colorConfig = {
    indigo: 'from-indigo-500 to-purple-500',
    blue: 'from-blue-500 to-cyan-500',
    purple: 'from-purple-500 to-pink-500',
    emerald: 'from-emerald-500 to-teal-500'
  };

  return (
    <div className="bg-gray-700/30 rounded-lg p-4">
      <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${colorConfig[color]} mb-2`}>
        {React.cloneElement(icon, { className: 'w-4 h-4 text-white' })}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  );

/**
 * État vide
 */
const EmptyState = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
    <FiPieChart className="w-16 h-16 mb-4 opacity-50" />
    <p className="text-lg">{message}</p>
  </div>
);

export default Analytics;
