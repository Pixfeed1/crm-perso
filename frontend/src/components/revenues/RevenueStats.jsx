// src/components/revenues/RevenueStats.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiDollarSign, FiBarChart2, FiAward, FiTrendingUp } from 'react-icons/fi';

const RevenueStats = ({ stats }) => {
  // Fonction pour formater les montants correctement
  const formatAmount = (amount) => {
    // Limiter à 2 décimales et ajouter l'espace comme séparateur de milliers
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const statItems = [
    {
      label: 'Revenus Totaux',
      value: formatAmount(stats.total),
      icon: <FiDollarSign />,
      color: 'from-emerald-500 to-teal-500',
      border: 'border-emerald-500',
      delay: 0.1
    },
    {
      label: 'Montant Moyen',
      value: formatAmount(stats.average),
      icon: <FiBarChart2 />,
      color: 'from-blue-500 to-indigo-500',
      border: 'border-blue-500',
      delay: 0.2
    },
    {
      label: 'Montant Maximum',
      value: formatAmount(stats.highest),
      icon: <FiAward />,
      color: 'from-purple-500 to-indigo-500',
      border: 'border-purple-500',
      delay: 0.3
    },
    {
      label: 'Revenus Prévus',
      value: formatAmount(stats.forecasted),
      icon: <FiTrendingUp />,
      color: 'from-amber-500 to-orange-500',
      border: 'border-amber-500',
      delay: 0.4
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      {statItems.map((item, index) => (
        <motion.div
          key={index}
          className={`bg-surface/30 backdrop-blur-sm rounded-xl p-4 border-l-4 ${item.border}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: item.delay }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-muted">{item.label}</p>
              <h3 className="text-2xl font-bold text-text-primary mt-1">{item.value}</h3>
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

export default RevenueStats;