// src/components/dashboard/RevenueVisualizer.jsx
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const RevenueVisualizer = ({ revenues = [], projects = [], showTitle = true, maxItems = 5 }) => {
  const [visualizationType, setVisualizationType] = useState('status'); // 'status', 'project', 'type'
  
  // Configuration des couleurs de statut
  const statusColors = {
    'paid': '#10B981', // vert
    'pending': '#F59E0B', // ambre
    'planned': '#3B82F6' // bleu
  };
  
  // Configuration des couleurs des types
  const typeColors = {
    'invoice': '#8B5CF6', // violet
    'recurring': '#EC4899', // rose
    'other': '#6B7280' // gris
  };
  
  // Générer une couleur aléatoire pour les projets
  const getProjectColor = (index) => {
    const colors = [
      '#06B6D4', // cyan
      '#14B8A6', // teal
      '#F97316', // orange
      '#8B5CF6', // violet
      '#EC4899', // rose
      '#EF4444', // rouge
      '#84CC16', // lime
      '#3B82F6', // bleu
      '#F59E0B'  // ambre
    ];
    
    return colors[index % colors.length];
  };
  
  // Formater les montants pour le tooltip
  const formatAmount = (amount) => `${amount.toLocaleString()} €`;
  
  // Préparation des données pour le graphique par statut
  const statusData = useMemo(() => {
    const data = [
      { name: 'Payé', value: 0, color: statusColors.paid },
      { name: 'En attente', value: 0, color: statusColors.pending },
      { name: 'Planifié', value: 0, color: statusColors.planned }
    ];
    
    revenues.forEach(revenue => {
      if (revenue.status === 'paid') {
        data[0].value += revenue.amount;
      } else if (revenue.status === 'pending') {
        data[1].value += revenue.amount;
      } else if (revenue.status === 'planned') {
        data[2].value += revenue.amount;
      }
    });
    
    return data.filter(item => item.value > 0);
  }, [revenues]);
  
  // Préparation des données pour le graphique par type
  const typeData = useMemo(() => {
    const data = [
      { name: 'Facture', value: 0, color: typeColors.invoice },
      { name: 'Récurrent', value: 0, color: typeColors.recurring },
      { name: 'Autre', value: 0, color: typeColors.other }
    ];
    
    revenues.forEach(revenue => {
      if (revenue.type === 'invoice') {
        data[0].value += revenue.amount;
      } else if (revenue.type === 'recurring') {
        data[1].value += revenue.amount;
      } else {
        data[2].value += revenue.amount;
      }
    });
    
    return data.filter(item => item.value > 0);
  }, [revenues]);
  
  // Préparation des données pour le graphique par projet
  const projectData = useMemo(() => {
    const projectAmounts = {};
    let noProjectAmount = 0;
    
    revenues.forEach(revenue => {
      if (revenue.project_id) {
        if (!projectAmounts[revenue.project_id]) {
          projectAmounts[revenue.project_id] = {
            name: revenue.project_name || `Projet ${revenue.project_id}`,
            value: 0
          };
        }
        projectAmounts[revenue.project_id].value += revenue.amount;
      } else {
        noProjectAmount += revenue.amount;
      }
    });
    
    const data = Object.values(projectAmounts);
    
    if (noProjectAmount > 0) {
      data.push({
        name: 'Sans projet',
        value: noProjectAmount
      });
    }
    
    // Trier par montant décroissant et ajouter les couleurs
    return data.sort((a, b) => b.value - a.value)
      .map((item, index) => ({
        ...item,
        color: getProjectColor(index)
      }));
  }, [revenues]);
  
  // Données à afficher en fonction du type de visualisation
  const chartData = useMemo(() => {
    if (visualizationType === 'status') {
      return statusData;
    } else if (visualizationType === 'type') {
      return typeData;
    } else {
      return projectData;
    }
  }, [visualizationType, statusData, typeData, projectData]);
  
  // Total des revenus
  const totalRevenue = useMemo(() => {
    return revenues.reduce((sum, revenue) => sum + revenue.amount, 0);
  }, [revenues]);
  
  // Liste des principales sources de revenus pour affichage
  const topRevenueSources = useMemo(() => {
    let data;
    
    if (visualizationType === 'status') {
      data = [...statusData];
    } else if (visualizationType === 'type') {
      data = [...typeData];
    } else {
      data = [...projectData];
    }
    
    return data.slice(0, maxItems);
  }, [visualizationType, statusData, typeData, projectData, maxItems]);
  
  // Personnalisation du tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = Math.round((data.value / totalRevenue) * 100);
      
      return (
        <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium">{data.name}</p>
          <p className="text-sm mt-1">
            <span className="text-gray-300">Montant: </span>
            <span className="text-white font-medium">{formatAmount(data.value)}</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-300">Pourcentage: </span>
            <span className="text-white font-medium">{percentage}%</span>
          </p>
        </div>
      );
    }
    
    return null;
  };
  
  // Rendu du composant
  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5">
      {showTitle && (
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-white flex items-center">
            <span className="mr-2">💰</span>
            Répartition des revenus
          </h3>
          
          <div className="flex space-x-1">
            <motion.button
              className={`px-3 py-1 rounded-lg text-xs ${
                visualizationType === 'status' 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              onClick={() => setVisualizationType('status')}
            >
              Statut
            </motion.button>
            <motion.button
              className={`px-3 py-1 rounded-lg text-xs ${
                visualizationType === 'type' 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              onClick={() => setVisualizationType('type')}
            >
              Type
            </motion.button>
            <motion.button
              className={`px-3 py-1 rounded-lg text-xs ${
                visualizationType === 'project' 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              onClick={() => setVisualizationType('project')}
            >
              Projet
            </motion.button>
          </div>
        </div>
      )}
      
      {revenues.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Graphique */}
          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* Liste des sources de revenus */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-white mb-2">
              {visualizationType === 'status' ? 'Par statut' : 
               visualizationType === 'type' ? 'Par type' : 'Par projet'}
            </h4>
            
            {topRevenueSources.map((item, index) => {
              const percentage = Math.round((item.value / totalRevenue) * 100);
              
              return (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="bg-gray-900/30 rounded-lg p-3"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-white font-medium truncate max-w-[150px]">{item.name}</span>
                    </div>
                    <span className="text-white font-medium">{formatAmount(item.value)}</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                    ></motion.div>
                  </div>
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-gray-400">{percentage}%</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <div className="text-4xl mb-3">💰</div>
          <h4 className="text-lg font-medium text-gray-300 mb-2">Aucun revenu</h4>
          <p className="text-gray-400 text-sm">
            Les revenus apparaîtront ici lorsque vous en ajouterez.
          </p>
        </div>
      )}
    </div>
  );
};

export default RevenueVisualizer;