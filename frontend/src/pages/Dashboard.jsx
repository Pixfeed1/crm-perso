// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
// Remplacer executeQuery par la fonction d'API
import { dashboardAPI } from '../services/api';

// Importation des icônes depuis react-icons (Font Awesome)
import { FaUserFriends, FaRocket, FaMoneyBillWave, FaClipboardList, FaBullseye } from 'react-icons/fa';

// Composants de visualisation
import KPIOrb from '../components/dashboard/KPIOrb';
import ProjectTimeline from '../components/dashboard/ProjectTimeline';
import RevenueVisualizer from '../components/dashboard/RevenueVisualizer';
import ActivityStream from '../components/dashboard/ActivityStream';
import GoalProgress from '../components/dashboard/GoalProgress';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    leads: { total: 0, newThisMonth: 0 },
    projects: { active: 0, completed: 0, upcoming: 0 },
    revenues: { thisMonth: 0, projection: 0, total: 0 },
    activities: { completed: 0, pending: 0 },
    goals: { onTrack: 0, atRisk: 0 }
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
          className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full">
      <header className="mb-8">
        <motion.h1 
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Vision Globale
        </motion.h1>
        <motion.p 
          className="text-indigo-200 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Votre activité en un coup d'œil
        </motion.p>
      </header>

      <div className="grid grid-cols-12 gap-6 h-[calc(100%-100px)]">
        {/* Section KPI principale */}
        <motion.div 
          className="col-span-12 lg:col-span-8 relative overflow-hidden bg-indigo-900/30 backdrop-blur-md rounded-2xl p-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-xl font-semibold mb-6 text-indigo-200">Performance Générale</h2>
          <div className="flex flex-wrap justify-center items-center gap-8 h-[calc(100%-40px)]">
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
              value={`${dashboardData.revenues.thisMonth} €`} 
              subValue={`Projection: ${dashboardData.revenues.projection} €`}
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

        {/* Panneau latéral avec visuels supplémentaires */}
        <motion.div 
          className="col-span-12 lg:col-span-4 grid grid-rows-3 gap-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          {/* Projets récents */}
          <div className="row-span-1 bg-purple-900/30 backdrop-blur-md rounded-2xl p-4 overflow-hidden">
            <h3 className="text-lg font-semibold mb-3 text-purple-200">Projets Récents</h3>
            <ProjectTimeline projects={dashboardData.projectTimeline || []} />
          </div>
          
          {/* Revenus */}
          <div className="row-span-1 bg-teal-900/30 backdrop-blur-md rounded-2xl p-4 overflow-hidden">
            <h3 className="text-lg font-semibold mb-3 text-teal-200">Revenus</h3>
            <RevenueVisualizer 
              currentValue={dashboardData.revenues.thisMonth} 
              targetValue={10000}
              chartData={dashboardData.revenueChart || []}
            />
          </div>
          
          {/* Prochaines activités */}
          <div className="row-span-1 bg-amber-900/30 backdrop-blur-md rounded-2xl p-4 overflow-hidden">
            <h3 className="text-lg font-semibold mb-3 text-amber-200">Prochaines Activités</h3>
            <ActivityStream activities={dashboardData.recentActivities || []} />
          </div>
        </motion.div>
        
        {/* Section inférieure avec progression des objectifs */}
        <motion.div 
          className="col-span-12 bg-rose-900/30 backdrop-blur-md rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <h2 className="text-xl font-semibold mb-4 text-rose-200">Progression des Objectifs</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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