// src/pages/Dashboard.jsx - Version Clean UX sans bordures
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
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
  FaFilter,
  FaFileInvoice,
  FaUser,
  FaStar
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
import { dashboardAPI, reviewRequestsAPI } from '../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
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
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [reviewStats, setReviewStats] = useState(null);
  const newMenuRef = useRef(null);

  // Fermer le menu si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target)) {
        setShowNewMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getData();
      setDashboardData(data);

      // Fetch review stats
      try {
        const stats = await reviewRequestsAPI.getStats();
        setReviewStats(stats);
      } catch (error) {
        console.error('Erreur lors de la récupération des stats d\'avis:', error);
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des données du tableau de bord:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchDashboardData();
  };

  const handleNewAction = (action) => {
    setShowNewMenu(false);
    switch (action) {
      case 'project':
        navigate('/projects');
        break;
      case 'client':
        navigate('/clients');
        break;
      case 'quote':
        navigate('/quotes');
        break;
      case 'invoice':
        navigate('/invoices');
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
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
    <div className="h-full flex flex-col overflow-y-auto">

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
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                title="Actualiser"
              >
                <FiRefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 transition-colors ${showFilters ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                title="Filtres"
              >
                <FaFilter className="w-5 h-5" />
              </button>

              {/* Menu "Nouveau" avec dropdown */}
              <div className="relative" ref={newMenuRef}>
                <button
                  onClick={() => setShowNewMenu(!showNewMenu)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <FaPlus className="w-4 h-4" />
                  <span className="text-sm font-medium text-white">Nouveau</span>
                </button>

                <AnimatePresence>
                  {showNewMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50"
                    >
                      <button
                        onClick={() => handleNewAction('project')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <FaRocket className="w-4 h-4 text-purple-400" />
                        <span>Nouveau projet</span>
                      </button>
                      <button
                        onClick={() => handleNewAction('client')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <FaUser className="w-4 h-4 text-blue-400" />
                        <span>Nouveau client</span>
                      </button>
                      <button
                        onClick={() => handleNewAction('quote')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <FaClipboardList className="w-4 h-4 text-amber-400" />
                        <span>Nouveau devis</span>
                      </button>
                      <button
                        onClick={() => handleNewAction('invoice')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <FaFileInvoice className="w-4 h-4 text-emerald-400" />
                        <span>Nouvelle facture</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5"
          >
            {/* Card Leads */}
            <motion.div
              whileHover={{ y: -4 }}
              onHoverStart={() => setHoveredCard('leads')}
              onHoverEnd={() => setHoveredCard(null)}
              className="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              {/* Accent gradient subtil */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className={`p-2 sm:p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'leads' ? 'bg-blue-500/20' : 'bg-slate-700/50'
                  }`}>
                    <FaUserFriends className="text-lg sm:text-xl text-blue-400" />
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
                  <p className="text-2xl sm:text-3xl font-light text-white">
                    {formatNumber(dashboardData.leads.total)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Total Leads</p>
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

          {/* ========== STATISTIQUES DES AVIS CLIENTS ========== */}
          {reviewStats && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-slate-800/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-500/10 rounded-xl">
                    <FaStar className="text-xl text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-white">Demandes d'avis</h2>
                    <p className="text-sm text-gray-500">Performance des demandes d'avis clients</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/clients')}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Demander un avis
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total */}
                <div className="bg-slate-700/20 backdrop-blur rounded-xl p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                    <FaStar />
                    <span>Total</span>
                  </div>
                  <p className="text-2xl font-light text-white mb-1">
                    {reviewStats.total || 0}
                  </p>
                  <p className="text-xs text-gray-500">demandes</p>
                </div>

                {/* Envoyées */}
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-green-400 text-xs mb-2">
                    <FaCheckCircle />
                    <span>Envoyées</span>
                  </div>
                  <p className="text-2xl font-light text-white mb-1">
                    {reviewStats.sent || 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reviewStats.total > 0
                      ? Math.round((reviewStats.sent / reviewStats.total) * 100)
                      : 0}%
                  </p>
                </div>

                {/* Cliquées */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-400 text-xs mb-2">
                    <FiActivity />
                    <span>Cliquées</span>
                  </div>
                  <p className="text-2xl font-light text-white mb-1">
                    {reviewStats.clicked || 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reviewStats.sent > 0
                      ? Math.round((reviewStats.clicked / reviewStats.sent) * 100)
                      : 0}% taux
                  </p>
                </div>

                {/* Avis laissés */}
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-yellow-400 text-xs mb-2">
                    <FaStar />
                    <span>Avis reçus</span>
                  </div>
                  <p className="text-2xl font-light text-white mb-1">
                    {reviewStats.reviewed || 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reviewStats.sent > 0
                      ? Math.round((reviewStats.reviewed / reviewStats.sent) * 100)
                      : 0}% conversion
                  </p>
                </div>
              </div>

              {/* Performance 30 derniers jours */}
              <div className="mt-6 pt-6 border-t border-gray-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FiTrendingUpIcon className="text-indigo-400" />
                    <span className="text-sm text-gray-400">30 derniers jours</span>
                  </div>
                  <span className="text-sm font-medium text-white">
                    {reviewStats.last_30_days || 0} demandes
                  </span>
                </div>
              </div>
            </motion.section>
          )}

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
