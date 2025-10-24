// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
// Remplacer executeQuery par la fonction d'API
import { dashboardAPI } from '../services/api';

// Importation des icônes depuis react-icons
import { FaUserFriends, FaRocket, FaMoneyBillWave, FaClipboardList, FaBullseye } from 'react-icons/fa';
import { FiCalendar as FiCalendarIcon, FiTrendingUp as FiTrendingUpIcon } from 'react-icons/fi';

// Composants de visualisation
import KPIOrb from '../components/dashboard/KPIOrb';
import ActivityStream from '../components/dashboard/ActivityStream';
import GoalProgress from '../components/dashboard/GoalProgress';

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

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);

        // Utiliser l'API pour récupérer les données du tableau de bord
        const data = await dashboardAPI.getData();
        console.log('Données du tableau de bord chargées via API:', data);

        // Mettre à jour l'état avec les données récupérées
        setDashboardData(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Erreur lors du chargement des données du dashboard:', error);
        // En cas d'erreur, garder les valeurs par défaut
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  // Formater les montants pour affichage
  const formatAmount = (amount) => {
    return Math.round(amount).toLocaleString('fr-FR');
  };

  return (
    <div className="h-full overflow-y-auto">
      <header className="mb-6 sm:mb-8 px-2 sm:px-0">
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

      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        {/* Section KPI principale - Responsive */}
        <motion.div
          className="relative overflow-hidden bg-indigo-900/30 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6 text-indigo-200">Performance Générale</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-8">
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
              title="Revenus Mensuels"
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
              size="md"
            />
            <KPIOrb
              title="Objectifs"
              value={dashboardData.goals.onTrack}
              subValue={`${dashboardData.goals.atRisk} à risque`}
              color="from-rose-500 to-red-500"
              icon={<FaBullseye />}
              size="md"
            />
          </div>
        </motion.div>

        {/* Grid adaptatif pour les panneaux latéraux */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Projets récents */}
          <motion.div
            className="lg:col-span-1 bg-purple-900/30 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-hidden"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-purple-200 flex items-center gap-2">
              <FiCalendarIcon />
              Projets Récents
            </h3>
            {dashboardData.projectTimeline && dashboardData.projectTimeline.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.projectTimeline.slice(0, 5).map((project, index) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 * index }}
                    className="bg-gray-800/30 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="text-white font-medium text-sm truncate flex-1">{project.name}</h4>
                      <span className={`ml-2 text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                        project.status === 'in_progress'
                          ? 'bg-blue-900/30 text-blue-300'
                          : 'bg-purple-900/30 text-purple-300'
                      }`}>
                        {project.status === 'in_progress' ? 'En cours' : 'Planifié'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                      <span>Début: {new Date(project.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                      <span>Fin: {new Date(project.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-900/30 rounded-lg p-6 text-center">
                <FiCalendarIcon className="text-4xl text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Aucun projet actif</p>
              </div>
            )}
          </motion.div>

          {/* Revenus - Graphique simple */}
          <motion.div
            className="lg:col-span-1 bg-teal-900/30 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-teal-200 flex items-center gap-2">
              <FiTrendingUpIcon />
              Revenus (6 derniers mois)
            </h3>
            {dashboardData.revenueChart && dashboardData.revenueChart.length > 0 ? (
              <div className="space-y-2">
                {dashboardData.revenueChart.map((item, index) => {
                  const maxAmount = Math.max(...dashboardData.revenueChart.map(i => i.amount));
                  const percentage = (item.amount / maxAmount) * 100;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 * index }}
                    >
                      <div className="flex justify-between text-xs text-gray-300 mb-1">
                        <span>{new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}</span>
                        <span className="font-medium">{formatAmount(item.amount)} €</span>
                      </div>
                      <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-gray-900/30 rounded-lg p-6 text-center">
                <FiTrendingUpIcon className="text-4xl text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Aucun revenu enregistré</p>
              </div>
            )}
          </motion.div>

          {/* Prochaines activités */}
          <motion.div
            className="lg:col-span-1 bg-amber-900/30 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-hidden"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-amber-200">Activités Récentes</h3>
            <div className="max-h-80 overflow-y-auto">
              <ActivityStream
                activities={dashboardData.recentActivities || []}
                showTitle={false}
                maxItems={5}
              />
            </div>
          </motion.div>
        </div>

        {/* Section inférieure avec progression des objectifs */}
        <motion.div
          className="bg-rose-900/30 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6 text-rose-200">Progression des Objectifs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <GoalProgress
              title="Nouveaux Leads"
              current={dashboardData.leads.newThisMonth}
              target={10}
              period="Mars 2025"
              color="blue"
            />
            <GoalProgress
              title="Projets Terminés"
              current={dashboardData.projects.completed}
              target={5}
              period="Mars 2025"
              color="purple"
            />
            <GoalProgress
              title="Revenus"
              current={dashboardData.revenues.thisMonth}
              target={8000}
              period="Mars 2025"
              color="emerald"
              format="currency"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
