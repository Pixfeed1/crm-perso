// src/pages/Dashboard.jsx - Version Refactored avec UX moderne
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaUserFriends, 
  FaRocket, 
  FaMoneyBillWave, 
  FaClipboardList, 
  FaBullseye,
  FaChartLine,
  FaArrowUp,
  FaArrowDown,
  FaClock,
  FaCheckCircle
} from 'react-icons/fa';
import { 
  FiCalendar as FiCalendarIcon, 
  FiTrendingUp as FiTrendingUpIcon,
  FiMoreHorizontal,
  FiActivity,
  FiTarget
} from 'react-icons/fi';
import KPIOrb from '../components/dashboard/KPIOrb';
import ActivityStream from '../components/dashboard/ActivityStream';
import GoalProgress from '../components/dashboard/GoalProgress';
import { dashboardAPI } from '../services/api';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    leads: { total: 0, newThisMonth: 0 },
    projects: { active: 0, completed: 0, upcoming: 0 },
    revenues: { thisMonth: 0, projection: 0, total: 0 },
    activities: { completed: 0, pending: 0 },
    goals: { onTrack: 0, atRisk: 0 },
    recentActivities: [],
    projectTimeline: [],
    revenueChart: []
  });

  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const data = await dashboardAPI.getData();
        setDashboardData(data);
      } catch (error) {
        console.error('Erreur lors de la récupération des données du tableau de bord:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse opacity-30"></div>
            <div className="absolute inset-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-spin"></div>
            <div className="absolute inset-4 rounded-full bg-slate-900"></div>
          </div>
          <p className="text-indigo-300 font-medium">Chargement de votre espace...</p>
        </motion.div>
      </div>
    );
  }

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('fr-FR').format(num);
  };

  // Calcul des variations
  const getVariation = (current, previous) => {
    if (!previous) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 sm:p-6 lg:p-8">
      
      {/* ========== HEADER MODERNE ========== */}
      <motion.header 
        className="mb-8"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Tableau de Bord
            </h1>
            <p className="text-slate-400 text-sm sm:text-base">
              Bienvenue Marc • {new Date().toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
          
          {/* Sélecteur de période */}
          <div className="flex gap-2 bg-slate-800/50 backdrop-blur-sm p-1 rounded-xl border border-slate-700/50">
            {['day', 'week', 'month', 'year'].map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedPeriod === period
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {period === 'day' && 'Jour'}
                {period === 'week' && 'Semaine'}
                {period === 'month' && 'Mois'}
                {period === 'year' && 'Année'}
              </button>
            ))}
          </div>
        </div>
      </motion.header>

      {/* ========== SECTION 1: KPIs PRINCIPAUX - Design Card moderne ========== */}
      <motion.section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        {/* KPI Card - Leads */}
        <motion.div
          className="relative bg-gradient-to-br from-blue-500/10 to-indigo-500/10 backdrop-blur-sm rounded-2xl p-6 border border-blue-500/20 hover:border-blue-400/40 transition-all group"
          whileHover={{ scale: 1.02 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/30 transition-colors">
              <FaUserFriends className="text-2xl text-blue-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg ${
              dashboardData.leads.newThisMonth > 0 
                ? 'text-emerald-400 bg-emerald-500/10' 
                : 'text-slate-400 bg-slate-500/10'
            }`}>
              {dashboardData.leads.newThisMonth > 0 ? <FaArrowUp /> : <FaArrowDown />}
              <span>+{dashboardData.leads.newThisMonth}</span>
            </div>
          </div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">Total Leads</h3>
          <p className="text-3xl font-bold text-white">{formatNumber(dashboardData.leads.total)}</p>
          <p className="text-xs text-slate-500 mt-2">Ce mois</p>
        </motion.div>

        {/* KPI Card - Projets */}
        <motion.div
          className="relative bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20 hover:border-purple-400/40 transition-all group"
          whileHover={{ scale: 1.02 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-purple-500/20 rounded-xl group-hover:bg-purple-500/30 transition-colors">
              <FaRocket className="text-2xl text-purple-400" />
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-purple-400 px-2 py-1 rounded-lg bg-purple-500/10">
              <FaClock className="text-xs" />
              <span>{dashboardData.projects.upcoming}</span>
            </div>
          </div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">Projets Actifs</h3>
          <p className="text-3xl font-bold text-white">{formatNumber(dashboardData.projects.active)}</p>
          <p className="text-xs text-slate-500 mt-2">{dashboardData.projects.completed} terminés</p>
        </motion.div>

        {/* KPI Card - Revenus */}
        <motion.div
          className="relative bg-gradient-to-br from-emerald-500/10 to-teal-500/10 backdrop-blur-sm rounded-2xl p-6 border border-emerald-500/20 hover:border-emerald-400/40 transition-all group"
          whileHover={{ scale: 1.02 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:bg-emerald-500/30 transition-colors">
              <FaMoneyBillWave className="text-2xl text-emerald-400" />
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg ${
              dashboardData.revenues.thisMonth >= 8000 
                ? 'text-emerald-400 bg-emerald-500/10' 
                : 'text-amber-400 bg-amber-500/10'
            }`}>
              <FaChartLine className="text-xs" />
              <span>{getVariation(dashboardData.revenues.thisMonth, 8000)}%</span>
            </div>
          </div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">Revenus du mois</h3>
          <p className="text-3xl font-bold text-white">{formatAmount(dashboardData.revenues.thisMonth)}</p>
          <p className="text-xs text-slate-500 mt-2">Obj: {formatAmount(8000)}</p>
        </motion.div>

        {/* KPI Card - Activités */}
        <motion.div
          className="relative bg-gradient-to-br from-amber-500/10 to-orange-500/10 backdrop-blur-sm rounded-2xl p-6 border border-amber-500/20 hover:border-amber-400/40 transition-all group"
          whileHover={{ scale: 1.02 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-amber-500/20 rounded-xl group-hover:bg-amber-500/30 transition-colors">
              <FaClipboardList className="text-2xl text-amber-400" />
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-amber-400 px-2 py-1 rounded-lg bg-amber-500/10">
              <FiActivity className="text-xs" />
              <span>{dashboardData.activities.pending}</span>
            </div>
          </div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">Activités complétées</h3>
          <p className="text-3xl font-bold text-white">{formatNumber(dashboardData.activities.completed)}</p>
          <p className="text-xs text-slate-500 mt-2">En attente: {dashboardData.activities.pending}</p>
        </motion.div>
      </motion.section>

      {/* ========== SECTION 2: GRAPHIQUES ET ANALYTICS ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Graphique principal - 2 colonnes */}
        <motion.section
          className="lg:col-span-2 bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-gradient-to-b from-indigo-400 to-purple-400 rounded-full"></div>
              <div>
                <h2 className="text-lg font-semibold text-white">Évolution des Revenus</h2>
                <p className="text-sm text-slate-400">6 derniers mois</p>
              </div>
            </div>
            <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
              <FiMoreHorizontal className="text-slate-400" />
            </button>
          </div>

          {dashboardData.revenueChart && dashboardData.revenueChart.length > 0 ? (
            <div className="space-y-4">
              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-700/50">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Moyenne</p>
                  <p className="text-lg font-semibold text-white">
                    {formatAmount(
                      dashboardData.revenueChart.reduce((sum, item) => sum + item.amount, 0) / 
                      dashboardData.revenueChart.length
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Maximum</p>
                  <p className="text-lg font-semibold text-white">
                    {formatAmount(Math.max(...dashboardData.revenueChart.map(i => i.amount)))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Total période</p>
                  <p className="text-lg font-semibold text-white">
                    {formatAmount(dashboardData.revenueChart.reduce((sum, item) => sum + item.amount, 0))}
                  </p>
                </div>
              </div>

              {/* Graphique en barres amélioré */}
              <div className="relative h-64 flex items-end gap-2">
                {dashboardData.revenueChart.map((item, index) => {
                  const maxAmount = Math.max(...dashboardData.revenueChart.map(i => i.amount));
                  const heightPercentage = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0;
                  
                  return (
                    <motion.div
                      key={index}
                      className="flex-1 relative group"
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPercentage}%` }}
                      transition={{ duration: 0.6, delay: 0.4 + index * 0.05 }}
                    >
                      {/* Tooltip */}
                      <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-slate-900 px-3 py-1 rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-slate-700">
                        {formatAmount(item.amount)}
                      </div>
                      
                      {/* Barre */}
                      <div className="h-full bg-gradient-to-t from-indigo-500 to-purple-400 rounded-t-lg hover:from-indigo-400 hover:to-purple-300 transition-colors cursor-pointer relative">
                        {/* Effet de brillance */}
                        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/10 rounded-t-lg"></div>
                      </div>
                      
                      {/* Label mois */}
                      <div className="absolute -bottom-6 left-0 right-0 text-center">
                        <p className="text-xs text-slate-500">
                          {new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short' })}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              
              <div className="h-6"></div> {/* Spacer pour les labels */}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <FiTrendingUpIcon className="text-4xl text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Aucune donnée disponible</p>
              </div>
            </div>
          )}
        </motion.section>

        {/* Objectifs rapides - 1 colonne */}
        <motion.section
          className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-8 bg-gradient-to-b from-emerald-400 to-teal-400 rounded-full"></div>
            <div>
              <h2 className="text-lg font-semibold text-white">Objectifs du mois</h2>
              <p className="text-sm text-slate-400">Progression en temps réel</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Objectif 1 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300 font-medium">Nouveaux Leads</span>
                <span className="text-sm font-bold text-blue-400">
                  {dashboardData.leads.newThisMonth}/10
                </span>
              </div>
              <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((dashboardData.leads.newThisMonth / 10) * 100, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </motion.div>
              </div>
            </div>

            {/* Objectif 2 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300 font-medium">Projets terminés</span>
                <span className="text-sm font-bold text-purple-400">
                  {dashboardData.projects.completed}/5
                </span>
              </div>
              <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((dashboardData.projects.completed / 5) * 100, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.6 }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </motion.div>
              </div>
            </div>

            {/* Objectif 3 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-300 font-medium">Chiffre d'affaires</span>
                <span className="text-sm font-bold text-emerald-400">
                  {Math.round((dashboardData.revenues.thisMonth / 8000) * 100)}%
                </span>
              </div>
              <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((dashboardData.revenues.thisMonth / 8000) * 100, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.7 }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </motion.div>
              </div>
              <p className="text-xs text-slate-500">
                {formatAmount(dashboardData.revenues.thisMonth)} / {formatAmount(8000)}
              </p>
            </div>

            {/* Status global */}
            <div className="pt-4 border-t border-slate-700/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Performance globale</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-sm font-medium text-emerald-400">En bonne voie</span>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      </div>

      {/* ========== SECTION 3: ACTIVITÉS ET PROJETS ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Flux d'activités */}
        <motion.section
          className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-gradient-to-b from-amber-400 to-orange-400 rounded-full"></div>
              <div>
                <h2 className="text-lg font-semibold text-white">Activités récentes</h2>
                <p className="text-sm text-slate-400">Dernières 24h</p>
              </div>
            </div>
            <button className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Voir tout
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {dashboardData.recentActivities && dashboardData.recentActivities.length > 0 ? (
              dashboardData.recentActivities.slice(0, 6).map((activity, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-700/30 transition-colors group"
                >
                  <div className={`p-2 rounded-lg mt-0.5 ${
                    activity.type === 'lead' ? 'bg-blue-500/20 text-blue-400' :
                    activity.type === 'project' ? 'bg-purple-500/20 text-purple-400' :
                    activity.type === 'revenue' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {activity.type === 'lead' ? <FaUserFriends /> :
                     activity.type === 'project' ? <FaRocket /> :
                     activity.type === 'revenue' ? <FaMoneyBillWave /> :
                     <FaClipboardList />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{activity.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{activity.description}</p>
                    <p className="text-xs text-slate-500 mt-2">{activity.time}</p>
                  </div>
                  <FaCheckCircle className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8">
                <FiActivity className="text-3xl text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aucune activité récente</p>
              </div>
            )}
          </div>
        </motion.section>

        {/* Projets en cours */}
        <motion.section
          className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-gradient-to-b from-indigo-400 to-blue-400 rounded-full"></div>
              <div>
                <h2 className="text-lg font-semibold text-white">Projets en cours</h2>
                <p className="text-sm text-slate-400">{dashboardData.projects.active} actifs</p>
              </div>
            </div>
            <button className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Gérer
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {dashboardData.projectTimeline && dashboardData.projectTimeline.length > 0 ? (
              dashboardData.projectTimeline.slice(0, 5).map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 + index * 0.05 }}
                  className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30 hover:border-indigo-500/30 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {project.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">{project.client || 'Client non défini'}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      project.status === 'in_progress'
                        ? 'bg-blue-500/20 text-blue-300'
                        : project.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {project.status === 'in_progress' ? 'En cours' :
                       project.status === 'completed' ? 'Terminé' : 'En attente'}
                    </span>
                  </div>
                  
                  {/* Barre de progression */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Progression</span>
                      <span className="text-slate-400 font-medium">{project.progress || 0}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${project.progress || 0}%` }}
                        transition={{ duration: 0.8, delay: 0.7 + index * 0.05 }}
                      />
                    </div>
                  </div>
                  
                  {/* Dates */}
                  <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <FiCalendarIcon className="text-slate-600" />
                      {new Date(project.start_date).toLocaleDateString('fr-FR', { 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </span>
                    <span>→</span>
                    <span className="flex items-center gap-1">
                      <FiTarget className="text-slate-600" />
                      {new Date(project.end_date).toLocaleDateString('fr-FR', { 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8">
                <FiCalendarIcon className="text-3xl text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aucun projet actif</p>
                <button className="mt-3 px-4 py-2 bg-indigo-500/20 text-indigo-300 rounded-lg hover:bg-indigo-500/30 transition-colors text-sm font-medium">
                  Créer un projet
                </button>
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
};

// Ajout des styles personnalisés pour la scrollbar
const customStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(30, 41, 59, 0.5);
    border-radius: 3px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(99, 102, 241, 0.3);
    border-radius: 3px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(99, 102, 241, 0.5);
  }
`;

// Injection des styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = customStyles;
  document.head.appendChild(styleSheet);
}

export default Dashboard;
