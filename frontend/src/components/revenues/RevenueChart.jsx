// src/components/revenues/RevenueChart.jsx
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useChartColors } from '../../utils/chartTheme';

const RevenueChart = ({ revenues, period, currentDate }) => {
  const chartColors = useChartColors();
  // Préparer les données pour le graphique en fonction de la période
  const chartData = useMemo(() => {
    if (!revenues || revenues.length === 0) {
      return [];
    }
    
    const now = new Date(currentDate);
    let data = [];
    
    if (period === 'month') {
      // Récupérer le nombre de jours dans le mois
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      
      // Initialiser un tableau avec tous les jours du mois
      data = Array.from({ length: daysInMonth }, (_, i) => {
        return {
          day: i + 1,
          name: `${i + 1}`,
          paid: 0,
          pending: 0,
          planned: 0
        };
      });
      
      // Remplir les données de revenus
      revenues.forEach(revenue => {
        const date = new Date(revenue.date);
        const day = date.getDate();
        
        if (data[day - 1]) {
          if (revenue.status === 'paid') {
            data[day - 1].paid += revenue.amount;
          } else if (revenue.status === 'pending') {
            data[day - 1].pending += revenue.amount;
          } else if (revenue.status === 'planned') {
            data[day - 1].planned += revenue.amount;
          }
        }
      });
    } else if (period === 'quarter') {
      // Récupérer le trimestre actuel
      const quarter = Math.floor(now.getMonth() / 3);
      const firstMonth = quarter * 3;
      
      // Initialiser un tableau avec les trois mois du trimestre
      data = Array.from({ length: 3 }, (_, i) => {
        return {
          month: firstMonth + i,
          name: new Date(now.getFullYear(), firstMonth + i, 1).toLocaleDateString('fr-FR', { month: 'short' }),
          paid: 0,
          pending: 0,
          planned: 0
        };
      });
      
      // Remplir les données de revenus
      revenues.forEach(revenue => {
        const date = new Date(revenue.date);
        const month = date.getMonth();
        const monthIndex = month - firstMonth;
        
        if (monthIndex >= 0 && monthIndex < 3) {
          if (revenue.status === 'paid') {
            data[monthIndex].paid += revenue.amount;
          } else if (revenue.status === 'pending') {
            data[monthIndex].pending += revenue.amount;
          } else if (revenue.status === 'planned') {
            data[monthIndex].planned += revenue.amount;
          }
        }
      });
    } else if (period === 'year') {
      // Initialiser un tableau avec tous les mois de l'année
      data = Array.from({ length: 12 }, (_, i) => {
        return {
          month: i,
          name: new Date(now.getFullYear(), i, 1).toLocaleDateString('fr-FR', { month: 'short' }),
          paid: 0,
          pending: 0,
          planned: 0
        };
      });
      
      // Remplir les données de revenus
      revenues.forEach(revenue => {
        const date = new Date(revenue.date);
        const month = date.getMonth();
        
        if (revenue.status === 'paid') {
          data[month].paid += revenue.amount;
        } else if (revenue.status === 'pending') {
          data[month].pending += revenue.amount;
        } else if (revenue.status === 'planned') {
          data[month].planned += revenue.amount;
        }
      });
    }
    
    return data;
  }, [revenues, period, currentDate]);

  // Formater les montants pour le tooltip
  const formatMontant = (value) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(value);
  };
  
  // Personnalisation du tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium">{label}</p>
          <div className="mt-2 space-y-1">
            {payload.map((entry, index) => (
              <div key={index} className="flex items-center" style={{ color: entry.color }}>
                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: entry.color }}></div>
                <p className="text-sm">
                  <span className="font-medium">{entry.name}: </span>
                  <span>{formatMontant(entry.value)}</span>
                </p>
              </div>
            ))}
            <div className="flex items-center text-white pt-1 border-t border-gray-700 mt-1">
              <div className="w-3 h-3 rounded-full mr-2 bg-white"></div>
              <p className="text-sm">
                <span className="font-medium">Total: </span>
                <span>{formatMontant(
                  payload.reduce((sum, entry) => sum + entry.value, 0)
                )}</span>
              </p>
            </div>
          </div>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Évolution des revenus</h3>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-emerald-500 mr-2"></div>
            <span className="text-xs text-gray-300">Payé</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-amber-500 mr-2"></div>
            <span className="text-xs text-gray-300">En attente</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
            <span className="text-xs text-gray-300">Planifié</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="name"
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis }}
              />
              <YAxis
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis }}
                tickFormatter={formatMontant}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="paid" 
                name="Payé"
                stackId="1"
                stroke="#10B981" 
                fillOpacity={1}
                fill="url(#colorPaid)" 
              />
              <Area 
                type="monotone" 
                dataKey="pending" 
                name="En attente"
                stackId="1"
                stroke="#F59E0B" 
                fillOpacity={1}
                fill="url(#colorPending)" 
              />
              <Area 
                type="monotone" 
                dataKey="planned" 
                name="Planifié"
                stackId="1"
                stroke="#3B82F6" 
                fillOpacity={1}
                fill="url(#colorPlanned)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-400">Aucune donnée disponible pour cette période</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RevenueChart;