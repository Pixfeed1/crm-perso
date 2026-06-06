// src/components/goals/GoalStats.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiTrendingUp, FiZap, FiCheckCircle, FiClock } from 'react-icons/fi';

const GoalStats = ({ stats }) => {
  const statItems = [
    {
      label: 'Progression globale',
      value: `${stats.progress}%`,
      icon: <FiTrendingUp />,
      color: 'from-amber-500 to-orange-500',
      borderColor: 'border-orange-500',
      delay: 0.1
    },
    {
      label: 'Objectifs actifs',
      value: stats.active.toString(),
      icon: <FiZap />,
      color: 'from-blue-500 to-indigo-500',
      borderColor: 'border-indigo-500',
      detail: `sur ${stats.total} total`,
      delay: 0.2
    },
    {
      label: 'Objectifs atteints',
      value: stats.completed.toString(),
      icon: <FiCheckCircle />,
      color: 'from-emerald-500 to-teal-500',
      borderColor: 'border-teal-500',
      detail: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% de complétion`,
      delay: 0.3
    },
    {
      label: 'Objectifs à venir',
      value: stats.upcoming.toString(),
      icon: <FiClock />,
      color: 'from-purple-500 to-indigo-500',
      borderColor: 'border-indigo-500',
      delay: 0.4
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      {statItems.map((item, index) => (
        <motion.div
          key={index}
          className={`bg-surface/30 backdrop-blur-sm rounded-xl p-4 border-l-4 ${item.borderColor}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: item.delay }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-muted">{item.label}</p>
              <h3 className="text-2xl font-bold text-text-primary mt-1">{item.value}</h3>
              {item.detail && (
                <p className="text-xs text-text-muted mt-1">{item.detail}</p>
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

export default GoalStats;