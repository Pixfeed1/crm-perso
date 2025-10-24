// src/components/activities/ActivityStats.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiCheckCircle, FiClipboard, FiClock, FiWatch } from 'react-icons/fi';

const ActivityStats = ({ stats }) => {
  // Fonction pour formater le temps en heures et minutes
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  };

  const statItems = [
    {
      label: 'Taux de complétion',
      value: `${Math.round(stats.completion_rate)}%`,
      icon: <FiCheckCircle />,
      color: 'from-indigo-500 to-purple-500',
      detail: `${stats.completed}/${stats.total} activités`,
      delay: 0.1
    },
    {
      label: 'Activités à venir',
      value: stats.pending.toString(),
      icon: <FiClipboard />,
      color: 'from-amber-500 to-orange-500',
      detail: 'En attente',
      delay: 0.2
    },
    {
      label: 'Temps prévu total',
      value: formatTime(stats.planned_time),
      icon: <FiClock />,
      color: 'from-blue-500 to-indigo-500',
      delay: 0.3
    },
    {
      label: 'Temps réel total',
      value: formatTime(stats.actual_time),
      icon: <FiWatch />,
      color: 'from-emerald-500 to-teal-500',
      detail: `${Math.round(stats.time_efficiency)}% d'efficacité`,
      delay: 0.4
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      {statItems.map((item, index) => (
        <motion.div
          key={index}
          className={`bg-gray-800/30 backdrop-blur-sm rounded-xl p-4 border-l-4 border-${item.color.split(' ')[1]}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: item.delay }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-400">{item.label}</p>
              <h3 className="text-2xl font-bold text-white mt-1">{item.value}</h3>
              {item.detail && (
                <p className="text-xs text-gray-400 mt-1">{item.detail}</p>
              )}
            </div>
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-xl shadow-lg`}>
              {item.icon}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default ActivityStats;