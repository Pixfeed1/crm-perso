// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaUserFriends, FaRocket, FaMoneyBillWave, FaClipboardList, FaBullseye } from 'react-icons/fa';
import { FiCalendar as FiCalendarIcon, FiTrendingUp as FiTrendingUpIcon } from 'react-icons/fi';
import KPIOrb from '../components/dashboard/KPIOrb';
import ActivityStream from '../components/dashboard/ActivityStream';
import GoalProgress from '../components/dashboard/GoalProgress';
import api from '../services/api';

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

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await api.get('/dashboard');
        setDashboardData(response.data);
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
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-indigo-200">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  const formatAmount = (amount) => {
    return Math.round(amount).toLocaleString('fr-FR');
  };

  return (
    <div className="h-full overflow-y-auto">
      <header className="mb-6 sm:mb-8 px-2 sm:px-0 pt-16 sm:pt-0">
        <motion.h1
          className="text-3xl sm:text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Vision Globale
        </motion.h1>
        <motion.p
          className="text-indigo-200 mt-2 text-sm sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Votre activité en un coup d'œil
        </motion.p>
      </header>

      {/* Architecture refactorisée - 4 zones distinctes avec espacement unifié */}
      <div className="space-y-8 px-2 sm:px-0">

        {/* ========== ZONE 1: KPI PRINCIPALES - Grid 4 colonnes uniforme ========== */}
        <motion.section
          className="relative overflow-hidden bg-gradient-to-br from-indigo-900/40 to-purple-900/40 backdrop-blur-md rounded-2xl p-6 border border-white/5"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-xl font-semibold mb-6 text-indigo-200 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-indigo-400 to-purple-400 rounded-full"></span>
            Indicateurs Clés
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <KPIOrb
              title="Leads"
              value={dashboardData.leads.total}
              subValue={`+${dashboardData.leads.newThisMonth} ce mois`}
              color="from-blue-500 to-indigo-500"
              icon={<FaUserFriends />}
              size="lg"
            />
            <KPIOrb
              title="Projets Actifs"
              value={dashboardData.projects.active}
              subValue={`${dashboardData.projects.upcoming} à venir`}
              color="from-purple-500 to-pink-500"
              icon={<FaRocket />}
              size="lg"
            />
            <KPIOrb
              title="Revenus Mois"
              value={`${formatAmount(dashboardData.revenues.thisMonth)} €`}
              subValue={`Proj: ${formatAmount(dashboardData.revenues.projection)} €`}
              color="from-emerald-500 to-teal-500"
              icon={<FaMoneyBillWave />}
              size="lg"
            />
            <KPIOrb
              title="Activités"
              value={dashboardData.activities.completed}
              subValue={`${dashboardData.activities.pending} en attente`}
              color="from-amber-500 to-orange-500"
              icon={<FaClipboardList />}
              size="lg"
            />
          </div>
        </motion.section>

        {/* ========== ZONE 2: GRAPHIQUES & STATS - Grid 2 colonnes avec hauteur min ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">

          {/* Revenus - Graphique barres */}
          <motion.section
            className="bg-gradient-to-br from-teal-900/40 to-emerald-900/40 backdrop-blur-md rounded-2xl p-6 border border-white/5 flex flex-col"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h3 className="text-lg font-semibold mb-6 text-teal-200 flex items-center gap-2">
              <FiTrendingUpIcon className="text-xl" />
              Revenus (6 derniers mois)
            </h3>

            {dashboardData.revenueChart && dashboardData.revenueChart.length > 0 ? (
              <div className="space-y-3 flex-1">
                {dashboardData.revenueChart.map((item, index) => {
                  const maxAmount = Math.max(...dashboardData.revenueChart.map(i => i.amount));
                  const percentage = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                      className="space-y-1"
                    >
                      <div className="flex justify-between text-sm text-gray-300">
                        <span className="font-medium">
                          {new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                        </span>
                        <span className="font-semibold text-teal-300">{formatAmount(item.amount)} €</span>
                      </div>
                      <div className="h-3 bg-gray-800/50 rounded-full overflow-hidden border border-gray-700/30">
                        <motion.div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full shadow-lg shadow-teal-500/20"
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, delay: 0.6 + index * 0.05, ease: "easeOut" }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-900/30 rounded-xl border border-gray-800/50">
                <div className="text-center py-12">
                  <FiTrendingUpIcon className="text-5xl text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucun revenu enregistré</p>
                </div>
              </div>
            )}
          </motion.section>

          {/* Pipeline / Stats complémentaires */}
          <motion.section
            className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 backdrop-blur-md rounded-2xl p-6 border border-white/5 flex flex-col"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <h3 className="text-lg font-semibold mb-6 text-purple-200 flex items-center gap-2">
              <FaBullseye className="text-xl" />
              Progression Objectifs
            </h3>

            <div className="flex-1 flex flex-col justify-center space-y-6">
              {/* Objectif Leads */}
              <div className="bg-gray-900/30 rounded-xl p-4 border border-gray-800/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-300">Nouveaux Leads</span>
                  <span className="text-lg font-bold text-blue-300">
                    {dashboardData.leads.newThisMonth} / 10
                  </span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((dashboardData.leads.newThisMonth / 10) * 100, 100)}%` }}
                    transition={{ duration: 1, delay: 0.7 }}
                  />
                </div>
              </div>

              {/* Objectif Projets */}
              <div className="bg-gray-900/30 rounded-xl p-4 border border-gray-800/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-300">Projets Terminés</span>
                  <span className="text-lg font-bold text-purple-300">
                    {dashboardData.projects.completed} / 5
                  </span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((dashboardData.projects.completed / 5) * 100, 100)}%` }}
                    transition={{ duration: 1, delay: 0.8 }}
                  />
                </div>
              </div>

              {/* Objectif Revenus */}
              <div className="bg-gray-900/30 rounded-xl p-4 border border-gray-800/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-300">Revenus Mensuels</span>
                  <span className="text-lg font-bold text-emerald-300">
                    {formatAmount(dashboardData.revenues.thisMonth)} / 8 000 €
                  </span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((dashboardData.revenues.thisMonth / 8000) * 100, 100)}%` }}
                    transition={{ duration: 1, delay: 0.9 }}
                  />
                </div>
              </div>
            </div>
          </motion.section>
        </div>

        {/* ========== ZONE 3: ACTIVITÉS & PROJETS - Grid 2 colonnes avec hauteur min ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">

          {/* Activités Récentes */}
          <motion.section
            className="bg-gradient-to-br from-amber-900/40 to-orange-900/40 backdrop-blur-md rounded-2xl p-6 border border-white/5 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <h3 className="text-lg font-semibold mb-6 text-amber-200 flex items-center gap-2">
              <FaClipboardList className="text-xl" />
              Activités Récentes
            </h3>

            <div className="flex-1 overflow-y-auto">
              <ActivityStream
                activities={dashboardData.recentActivities || []}
                showTitle={false}
                maxItems={5}
              />
            </div>
          </motion.section>

          {/* Projets en Cours */}
          <motion.section
            className="bg-gradient-to-br from-indigo-900/40 to-blue-900/40 backdrop-blur-md rounded-2xl p-6 border border-white/5 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <h3 className="text-lg font-semibold mb-6 text-indigo-200 flex items-center gap-2">
              <FiCalendarIcon className="text-xl" />
              Projets en Cours
            </h3>

            {dashboardData.projectTimeline && dashboardData.projectTimeline.length > 0 ? (
              <div className="space-y-3 flex-1 overflow-y-auto">
                {dashboardData.projectTimeline.slice(0, 5).map((project, index) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.7 + index * 0.05 }}
                    className="bg-gray-900/40 rounded-xl p-4 border border-gray-800/50 hover:border-indigo-500/30 transition-all"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="text-white font-semibold text-sm flex-1 pr-2">{project.name}</h4>
                      <span className={`text-xs px-3 py-1 rounded-full whitespace-nowrap font-medium ${
                        project.status === 'in_progress'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      }`}>
                        {project.status === 'in_progress' ? 'En cours' : 'Planifié'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="text-gray-500">Début:</span>
                        {new Date(project.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-gray-500">Fin:</span>
                        {new Date(project.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-900/30 rounded-xl border border-gray-800/50">
                <div className="text-center py-12">
                  <FiCalendarIcon className="text-5xl text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucun projet actif</p>
                </div>
              </div>
            )}
          </motion.section>
        </div>

        {/* ========== ZONE 4: OBJECTIFS DÉTAILLÉS - Grid 3 colonnes ========== */}
        <motion.section
          className="bg-gradient-to-br from-rose-900/40 to-red-900/40 backdrop-blur-md rounded-2xl p-6 border border-white/5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <h2 className="text-xl font-semibold mb-6 text-rose-200 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-rose-400 to-red-400 rounded-full"></span>
            Objectifs du Mois
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <GoalProgress
              title="Nouveaux Leads"
              current={dashboardData.leads.newThisMonth}
              target={10}
              period="Ce mois"
              color="blue"
            />
            <GoalProgress
              title="Projets Terminés"
              current={dashboardData.projects.completed}
              target={5}
              period="Ce mois"
              color="purple"
            />
            <GoalProgress
              title="Revenus"
              current={dashboardData.revenues.thisMonth}
              target={8000}
              period="Ce mois"
              color="emerald"
              format="currency"
            />
          </div>
        </motion.section>

      </div>
    </div>
  );
};

export default Dashboard;
