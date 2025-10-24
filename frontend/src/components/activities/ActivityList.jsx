// src/components/activities/ActivityList.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiMonitor, FiEdit2, FiUsers, FiPhone, FiVolume2, FiTool, FiClipboard, FiCheckCircle, FiZap, FiUser, FiClock } from 'react-icons/fi';

const ActivityList = ({ activities, selectedActivity, onSelectActivity, onCompleteActivity }) => {
  // Fonction pour formater le temps en heures et minutes
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  };

  // Formatage de la date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  // Configuration des couleurs de type
  const typeConfig = {
    'development': { icon: <FiMonitor />, label: 'Développement', bg: 'bg-blue-900/20' },
    'design': { icon: <FiEdit2 />, label: 'Design', bg: 'bg-purple-900/20' },
    'meeting': { icon: <FiUsers />, label: 'Réunion', bg: 'bg-indigo-900/20' },
    'call': { icon: <FiPhone />, label: 'Appel', bg: 'bg-green-900/20' },
    'marketing': { icon: <FiVolume2 />, label: 'Marketing', bg: 'bg-amber-900/20' },
    'maintenance': { icon: <FiTool />, label: 'Maintenance', bg: 'bg-teal-900/20' }
  };
  
  // Configuration des couleurs de priorité
  const priorityConfig = {
    'high': { color: 'bg-rose-500/20 text-rose-300', label: 'Haute' },
    'medium': { color: 'bg-amber-500/20 text-amber-300', label: 'Moyenne' },
    'low': { color: 'bg-blue-500/20 text-blue-300', label: 'Basse' }
  };
  
  // Groupement des activités par date
  const groupedActivities = activities.reduce((groups, activity) => {
    const date = activity.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {});
  
  // Tri des dates (de la plus récente à la plus ancienne)
  const sortedDates = Object.keys(groupedActivities).sort((a, b) => new Date(b) - new Date(a));
  
  if (activities.length === 0) {
    return (
      <div className="bg-gray-900/30 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3"><FiClipboard /></div>
        <h4 className="text-lg font-medium text-gray-300 mb-2">Aucune activité</h4>
        <p className="text-gray-400 text-sm">
          Aucune activité trouvée pour cette période ou avec ces filtres.
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex-1 overflow-visible space-y-6">
      {sortedDates.map(date => (
        <div key={date} className="space-y-2">
          <div className="sticky top-0 bg-gray-900/70 backdrop-blur-sm px-3 py-2 rounded-lg z-10">
            <h3 className="text-md font-medium text-gray-300">
              {formatDate(date)}
            </h3>
          </div>
          
          {groupedActivities[date].map(activity => {
            const isSelected = selectedActivity && selectedActivity.id === activity.id;
            const typeInfo = typeConfig[activity.type] || { icon: <FiClipboard />, label: activity.type, bg: 'bg-gray-900/20' };
            const priorityInfo = priorityConfig[activity.priority] || { color: 'bg-gray-500/20 text-gray-300', label: activity.priority };
            
            return (
              <motion.div
                key={activity.id}
                className={`p-4 rounded-xl cursor-pointer ${isSelected ? 'bg-indigo-900/30' : 'bg-gray-800/50 hover:bg-gray-800/70'}`}
                whileHover={{ scale: 1.01 }}
                onClick={() => onSelectActivity(activity)}
                layout
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start space-x-3">
                    {/* Icône du type */}
                    <div className={`w-10 h-10 rounded-lg ${typeInfo.bg} flex items-center justify-center text-xl`}>
                      {typeInfo.icon}
                    </div>
                    
                    {/* Description et détails */}
                    <div className="overflow-hidden">
                      <h4 className="font-medium text-white break-words">{activity.description}</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {/* Priorité */}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${priorityInfo.color}`}>
                          {priorityInfo.label}
                        </span>
                        
                        {/* Association projet/lead */}
                        {activity.project_name && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-indigo-900/30 text-indigo-300 text-xs gap-1">
                            <FiZap /> {activity.project_name}
                          </span>
                        )}
                        {activity.lead_name && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-purple-900/30 text-purple-300 text-xs gap-1">
                            <FiUser /> {activity.lead_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Temps et statut */}
                  <div className="flex flex-col items-end">
                    <div className="text-sm text-gray-300">
                      {formatTime(activity.planned_time)}
                    </div>
                    {activity.status === 'completed' ? (
                      <span className="inline-flex items-center px-2 py-1 mt-2 rounded-full bg-green-900/30 text-green-300 text-xs gap-1">
                        <FiCheckCircle /> Terminé
                      </span>
                    ) : (
                      <motion.button
                        className="inline-flex items-center px-2 py-1 mt-2 rounded-full bg-amber-900/30 text-amber-300 hover:bg-amber-900/50 text-xs"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const actual_time = window.prompt(
                            "Temps réel passé (en minutes)", 
                            activity.planned_time.toString()
                          );
                          if (actual_time !== null) {
                            onCompleteActivity(activity.id, parseInt(actual_time, 10) || 0);
                          }
                        }}
                      >
                        <FiClock className="mr-1" /> Terminer
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default ActivityList;