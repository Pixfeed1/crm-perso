// src/components/alerts/AlertsWidget.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBell, FaExclamationTriangle, FaCheckCircle, FaTasks, FaBullseye, FaUserClock, FaCalendarAlt, FaUserTimes } from 'react-icons/fa';

const AlertsWidget = () => {
  const [alerts, setAlerts] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    fetchAlerts();
    // Rafraîchir toutes les 2 minutes
    const interval = setInterval(fetchAlerts, 120000);
    return () => clearInterval(interval);
  }, []);

  // Animation de pulsation pour attirer l'attention
  useEffect(() => {
    if (alerts && alerts.summary.total_alerts > 0) {
      const interval = setInterval(() => {
        setPulsing(true);
        setTimeout(() => setPulsing(false), 1000);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [alerts]);

  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/alerts/summary', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des alertes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-gray-700 rounded w-24 mb-2 animate-pulse" />
            <div className="h-3 bg-gray-700 rounded w-32 animate-pulse" />
          </div>
        </div>
      </motion.div>
    );
  }

  if (!alerts) return null;

  const { summary, message } = alerts;
  const totalAlerts = summary.total_alerts;

  // Couleur selon sévérité
  const severityConfig = {
    critical: {
      color: 'from-rose-500 to-pink-600',
      textColor: 'text-rose-300',
      borderColor: 'border-rose-500/30',
      bgColor: 'bg-rose-500/10',
      icon: FaExclamationTriangle
    },
    warning: {
      color: 'from-amber-500 to-orange-600',
      textColor: 'text-amber-300',
      borderColor: 'border-amber-500/30',
      bgColor: 'bg-amber-500/10',
      icon: FaBell
    },
    info: {
      color: 'from-emerald-500 to-teal-600',
      textColor: 'text-emerald-300',
      borderColor: 'border-emerald-500/30',
      bgColor: 'bg-emerald-500/10',
      icon: FaCheckCircle
    }
  };

  const config = severityConfig[summary.severity] || severityConfig.info;
  const Icon = config.icon;

  return (
    <motion.div
      className={`relative bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border ${config.borderColor} cursor-pointer overflow-hidden`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Effet de lueur animée en arrière-plan */}
      <motion.div
        className={`absolute inset-0 bg-gradient-to-br ${config.color} opacity-5`}
        animate={{
          opacity: pulsing ? 0.15 : 0.05,
        }}
        transition={{ duration: 0.5 }}
      />

      {/* Contenu principal */}
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          {/* Icône et badge */}
          <div className="relative">
            <motion.div
              className={`p-3 rounded-xl bg-gradient-to-br ${config.color} shadow-lg`}
              animate={{
                boxShadow: pulsing
                  ? "0 0 20px rgba(255, 255, 255, 0.3)"
                  : "0 0 10px rgba(255, 255, 255, 0.1)"
              }}
            >
              <Icon className="w-6 h-6 text-white" />
            </motion.div>

            {/* Badge avec nombre */}
            {totalAlerts > 0 && (
              <motion.div
                className={`absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center text-white text-xs font-bold shadow-lg`}
                initial={{ scale: 0 }}
                animate={{ scale: pulsing ? 1.2 : 1 }}
                transition={{ type: "spring", stiffness: 500 }}
              >
                {totalAlerts > 99 ? '99+' : totalAlerts}
              </motion.div>
            )}
          </div>

          {/* Indicateur expand/collapse */}
          <motion.div
            className={`${config.textColor}`}
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>

        {/* Titre et message */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white mb-1">
            Alertes et Notifications
          </h3>
          <p className={`text-sm ${config.textColor}`}>
            {message}
          </p>
        </div>

        {/* Résumé compact */}
        <div className="grid grid-cols-2 gap-3">
          <AlertBadge
            icon={FaTasks}
            label="Tâches retard"
            value={summary.overdue_tasks}
            color="rose"
          />
          <AlertBadge
            icon={FaBullseye}
            label="Objectifs risque"
            value={summary.at_risk_goals}
            color="amber"
          />
          <AlertBadge
            icon={FaUserClock}
            label="Activités"
            value={summary.pending_activities}
            color="purple"
          />
          <AlertBadge
            icon={FaCalendarAlt}
            label="Échéances 7j"
            value={summary.upcoming_deadlines}
            color="indigo"
          />
        </div>

        {/* Badge leads inactifs */}
        {summary.stale_leads > 0 && (
          <motion.div
            className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-gray-700/30"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <FaUserTimes className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">
              {summary.stale_leads} lead{summary.stale_leads > 1 ? 's' : ''} inactif{summary.stale_leads > 1 ? 's' : ''}
            </span>
          </motion.div>
        )}
      </div>

      {/* Section détails expandable */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 mt-4 pt-4 border-t border-gray-700"
          >
            <div className="space-y-2 text-sm">
              <DetailRow
                label="Tâches en retard"
                value={summary.overdue_tasks}
                critical={summary.overdue_tasks > 5}
              />
              <DetailRow
                label="Activités en attente"
                value={summary.pending_activities}
                critical={summary.pending_activities > 5}
              />
              <DetailRow
                label="Objectifs à risque"
                value={summary.at_risk_goals}
                warning={summary.at_risk_goals > 0}
              />
              <DetailRow
                label="Échéances à venir"
                value={summary.upcoming_deadlines}
                info
              />
              <DetailRow
                label="Leads inactifs"
                value={summary.stale_leads}
                warning={summary.stale_leads > 10}
              />
            </div>

            {/* Bouton voir toutes les alertes */}
            <motion.button
              className={`mt-4 w-full py-2 px-4 rounded-lg bg-gradient-to-r ${config.color} text-white font-medium text-sm`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Naviguer vers la page des alertes détaillées
                console.log('Navigation vers les alertes détaillées');
              }}
            >
              Voir toutes les alertes
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Particules animées subtiles */}
      {totalAlerts > 0 && Array.from({ length: 3 }).map((_, index) => (
        <motion.div
          key={index}
          className="absolute w-1 h-1 rounded-full bg-white/20"
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{
            x: Math.sin(index * Math.PI / 1.5) * 30,
            y: Math.cos(index * Math.PI / 1.5) * 30,
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: 3 + index,
            repeat: Infinity,
            delay: index * 0.5,
            ease: "easeInOut"
          }}
          style={{
            left: '50%',
            top: '20%',
          }}
        />
      ))}
    </motion.div>
  );
};

// Composant pour les badges de résumé
const AlertBadge = ({ icon: Icon, label, value, color = 'indigo' }) => {
  const colorConfig = {
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
  };

  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border ${colorConfig[color]}`}>
      <Icon className="w-4 h-4" />
      <div className="flex-1 min-w-0">
        <div className="text-xs opacity-70 truncate">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
};

// Composant pour les lignes de détail
const DetailRow = ({ label, value, critical, warning, info }) => {
  const getColor = () => {
    if (critical) return 'text-rose-400';
    if (warning) return 'text-amber-400';
    if (info) return 'text-indigo-400';
    return 'text-gray-400';
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-300">{label}</span>
      <span className={`font-semibold ${getColor()}`}>{value}</span>
    </div>
  );
};

export default AlertsWidget;
