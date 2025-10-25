// src/pages/Dashboard.jsx - Version Clean UX sans bordures
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
  FaCheckCircle,
  FaEllipsisV,
  FaPlus,
  FaFilter
} from 'react-icons/fa';
import { 
  FiCalendar as FiCalendarIcon, 
  FiTrendingUp as FiTrendingUpIcon,
  FiMoreHorizontal,
  FiActivity,
  FiTarget,
  FiClock,
  FiRefreshCw
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
  const [selectedView, setSelectedView] = useState('overview');
  const [hoveredCard, setHoveredCard] = useState(null);

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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement...</p>
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
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  const getVariation = (current, previous = 100) => {
    const diff = ((current - previous) / previous * 100).toFixed(0);
    return diff > 0 ? `+${diff}` : diff;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      
      {/* ========== HEADER ÉPURÉ ========== */}
      <motion.header 
        className="px-6 pt-8 pb-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-light text-white">
                Bonjour Marc
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                {new Date().toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  day: 'numeric',
                  month: 'long' 
                })}
              </p>
            </div>
            
            {/* Actions rapides */}
            <div className="flex items-center gap-3">
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <FiRefreshCw className="w-5 h-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-white transition-colors">
                <FaFilter className="w-5 h-5" />
              </button>
              <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2">
                <FaPlus className="w-4 h-4" />
                <span className="text-sm font-medium">Nouveau</span>
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* ========== CONTENU PRINCIPAL ========== */}
      <div className="px-6 pb-12">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* ========== MÉTRIQUES PRINCIPALES - Sans bordures ========== */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
          >
            {/* Card Leads */}
            <motion.div
              whileHover={{ y: -4 }}
              onHoverStart={() => setHoveredCard('leads')}
              onHoverEnd={() => setHoveredCard(null)}
              className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              {/* Accent gradient subtil */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'leads' ? 'bg-blue-500/20' : 'bg-slate-700/50'
                  }`}>
                    <FaUserFriends className="text-xl text-blue-400" />
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full transition-all ${
                    dashboardData.leads.newThisMonth > 0 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-gray-400 bg-gray-500/10'
                  }`}>
                    {getVariation(dashboardData.leads.newThisMonth, 10)}%
                  </span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-3xl font-light text-white">
                    {formatNumber(dashboardData.leads.total)}
                  </p>
                  <p className="text-sm text-gray-400">Total Leads</p>
                  <p className="text-xs text-gray-500">
                    +{dashboardData.leads.newThisMonth} ce mois
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Card Projets */}
            <motion.div
              whileHover={{ y: -4 }}
              onHoverStart={() => setHoveredCard('projects')}
              onHoverEnd={() => setHoveredCard(null)}
              className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'projects' ? 'bg-purple-500/20' : 'bg-slate-700/50'
                  }`}>
                    <FaRocket className="text-xl text-purple-400" />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full text-purple-400 bg-purple-500/10">
                    {dashboardData.projects.upcoming} à venir
                  </span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-3xl font-light text-white">
                    {formatNumber(dashboardData.projects.active)}
                  </p>
                  <p className="text-sm text-gray-400">Projets Actifs</p>
                  <p className="text-xs text-gray-500">
                    {dashboardData.projects.completed} terminés
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Card Revenus */}
            <motion.div
              whileHover={{ y: -4 }}
              onHoverStart={() => setHoveredCard('revenue')}
              onHoverEnd={() => setHoveredCard(null)}
              className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'revenue' ? 'bg-emerald-500/20' : 'bg-slate-700/50'
                  }`}>
                    <FaMoneyBillWave className="text-xl text-emerald-400" />
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full transition-all ${
                    dashboardData.revenues.thisMonth >= 8000 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-amber-400 bg-amber-500/10'
                  }`}>
                    <FaChartLine className="inline w-3 h-3 mr-1" />
                    {Math.round((dashboardData.revenues.thisMonth / 8000) * 100)}%
                  </span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-3xl font-light text-white">
                    {formatAmount(dashboardData.revenues.thisMonth)}
                  </p>
                  <p className="text-sm text-gray-400">Revenus du mois</p>
                  <p className="text-xs text-gray-500">
                    Objectif: {formatAmount(8000)}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Card Activités */}
            <motion.div
              whileHover={{ y: -4 }}
              onHoverStart={() => setHoveredCard('activities')}
              onHoverEnd={() => setHoveredCard(null)}
              className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'activities' ? 'bg-amber-500/20' : 'bg-slate-700/50'
                  }`}>
                    <FaClipboardList className="text-xl text-amber-400" />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full text-amber-400 bg-amber-500/10">
                    {dashboardData.activities.pending} en attente
                  </span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-3xl font-light text-white">
                    {formatNumber(dashboardData.activities.completed)}
                  </p>
                  <p className="text-sm text-gray-400">Tâches complétées</p>
                  <p className="text-xs text-gray-500">
                    Cette semaine
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* ========== GRAPHIQUES & VISUALISATIONS ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Graphique principal - Évolution revenus */}
            <motion.section
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2 bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-lg font-medium text-white mb-1">Performance Financière</h2>
                  <p className="text-sm text-gray-500">Évolution sur 6 mois</p>
                </div>
                <button className="p-2 text-gray-400 hover:text-white transition-colors">
                  <FiMoreHorizontal className="w-5 h-5" />
                </button>
              </div>

              {dashboardData.revenueChart && dashboardData.revenueChart.length > 0 ? (
                <div>
                  {/* Stats rapides */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="text-center">
                      <p className="text-2xl font-light text-white mb-1">
                        {formatAmount(
                          dashboardData.revenueChart.reduce((sum, item) => sum + item.amount, 0) / 
                          dashboardData.revenueChart.length
                        )}
                      </p>
                      <p className="text-xs text-gray-500">Moyenne mensuelle</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-light text-white mb-1">
                        {formatAmount(Math.max(...dashboardData.revenueChart.map(i => i.amount)))}
                      </p>
                      <p className="text-xs text-gray-500">Meilleur mois</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-light text-white mb-1">
                        {formatAmount(dashboardData.revenueChart.reduce((sum, item) => sum + item.amount, 0))}
                      </p>
                      <p className="text-xs text-gray-500">Total période</p>
                    </div>
                  </div>

                  {/* Graphique minimaliste */}
                  <div className="relative h-48">
                    <div className="absolute inset-0 flex items-end justify-between gap-3">
                      {dashboardData.revenueChart.map((item, index) => {
                        const maxAmount = Math.max(...dashboardData.revenueChart.map(i => i.amount));
                        const heightPercentage = (item.amount / maxAmount) * 100;
                        
                        return (
                          <motion.div
                            key={index}
                            className="flex-1 relative group"
                            initial={{ height: 0 }}
                            animate={{ height: `${heightPercentage}%` }}
                            transition={{ duration: 0.8, delay: 0.3 + index * 0.05 }}
                          >
                            {/* Tooltip au hover */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                              {formatAmount(item.amount)}
                            </div>
                            
                            {/* Barre simple sans bordure */}
                            <div className="h-full bg-gradient-to-t from-indigo-600/80 to-indigo-400/80 rounded-t-lg hover:from-indigo-500 hover:to-indigo-300 transition-all cursor-pointer" />
                          </motion.div>
                        );
                      })}
                    </div>
                    
                    {/* Labels des mois */}
                    <div className="absolute -bottom-6 inset-x-0 flex justify-between">
                      {dashboardData.revenueChart.map((item, index) => (
                        <div key={index} className="flex-1 text-center">
                          <p className="text-xs text-gray-600">
                            {new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="h-8"></div>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  <p className="text-gray-500">Aucune donnée disponible</p>
                </div>
              )}
            </motion.section>

            {/* Panel Objectifs */}
            <motion.section
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <h2 className="text-lg font-medium text-white mb-6">Objectifs du mois</h2>

              <div className="space-y-6">
                {/* Objectif Leads */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Nouveaux Leads</span>
                    <span className="text-sm font-medium text-white">
                      {dashboardData.leads.newThisMonth}/10
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((dashboardData.leads.newThisMonth / 10) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.4 }}
                    />
                  </div>
                </div>

                {/* Objectif Projets */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Projets terminés</span>
                    <span className="text-sm font-medium text-white">
                      {dashboardData.projects.completed}/5
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((dashboardData.projects.completed / 5) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                    />
                  </div>
                </div>

                {/* Objectif CA */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Chiffre d'affaires</span>
                    <span className="text-sm font-medium text-white">
                      {Math.round((dashboardData.revenues.thisMonth / 8000) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((dashboardData.revenues.thisMonth / 8000) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.6 }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {formatAmount(dashboardData.revenues.thisMonth)} sur {formatAmount(8000)}
                  </p>
                </div>

                {/* Indicateur global */}
                <div className="pt-4 mt-2">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-sm text-gray-400">Performance: </span>
                    <span className="text-sm font-medium text-emerald-400">Excellente</span>
                  </div>
                </div>
              </div>
            </motion.section>
          </div>

          {/* ========== ACTIVITÉS ET PROJETS ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Activités récentes */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-white">Activité récente</h2>
                <button className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                  Tout voir
                </button>
              </div>

              <div className="space-y-4">
                {dashboardData.recentActivities && dashboardData.recentActivities.length > 0 ? (
                  dashboardData.recentActivities.slice(0, 5).map((activity, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + index * 0.05 }}
                      className="flex items-start gap-3 group cursor-pointer"
                    >
                      {/* Icône minimaliste */}
                      <div className={`p-2 rounded-lg transition-all ${
                        activity.type === 'lead' ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20' :
                        activity.type === 'project' ? 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20' :
                        activity.type === 'revenue' ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20' :
                        'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20'
                      }`}>
                        {activity.type === 'lead' ? <FaUserFriends className="w-4 h-4" /> :
                         activity.type === 'project' ? <FaRocket className="w-4 h-4" /> :
                         activity.type === 'revenue' ? <FaMoneyBillWave className="w-4 h-4" /> :
                         <FaClipboardList className="w-4 h-4" />}
                      </div>
                      
                      {/* Contenu */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white group-hover:text-indigo-300 transition-colors">
                          {activity.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <FiActivity className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Aucune activité</p>
                  </div>
                )}
              </div>
            </motion.section>

            {/* Liste des projets */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-white">Projets actifs</h2>
                <span className="text-sm text-gray-500">
                  {dashboardData.projects.active} en cours
                </span>
              </div>

              <div className="space-y-3">
                {dashboardData.projectTimeline && dashboardData.projectTimeline.length > 0 ? (
                  dashboardData.projectTimeline.slice(0, 4).map((project, index) => (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.05 }}
                      className="bg-slate-700/20 backdrop-blur rounded-xl p-4 hover:bg-slate-700/30 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors">
                            {project.name}
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {project.client || 'Client'}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          project.status === 'in_progress'
                            ? 'bg-blue-500/10 text-blue-400'
                            : project.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {project.status === 'in_progress' ? 'En cours' :
                           project.status === 'completed' ? 'Terminé' : 'Planifié'}
                        </span>
                      </div>
                      
                      {/* Progress bar simple */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Progression</span>
                          <span className="text-gray-400">{project.progress || 45}%</span>
                        </div>
                        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${project.progress || 45}%` }}
                            transition={{ duration: 1, delay: 0.6 + index * 0.1 }}
                          />
                        </div>
                      </div>
                      
                      {/* Timeline simple */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <FiClock className="w-3 h-3" />
                          {new Date(project.start_date).toLocaleDateString('fr-FR', { 
                            day: 'numeric', 
                            month: 'short' 
                          })}
                        </span>
                        <span className="text-gray-600">→</span>
                        <span>
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
                    <FiCalendarIcon className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-3">Aucun projet actif</p>
                    <button className="px-4 py-2 bg-indigo-600/20 text-indigo-400 rounded-lg hover:bg-indigo-600/30 transition-colors text-sm">
                      Créer un projet
                    </button>
                  </div>
                )}
              </div>
            </motion.section>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
