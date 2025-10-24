// src/components/dashboard/ActivityStream.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMonitor, FiEdit2, FiUsers, FiPhone, FiVolume2, FiTool, FiClipboard, FiZap, FiUser } from 'react-icons/fi';

const ActivityStream = ({ activities = [], projects = [], showTitle = true, maxItems = 7 }) => {
  const [expanded, setExpanded] = useState(false);

  // Configuration des couleurs de type
  const typeConfig = {
    'development': { icon: <FiMonitor />, label: 'Développement', bg: 'bg-blue-900/20', text: 'text-blue-300' },
    'design': { icon: <FiEdit2 />, label: 'Design', bg: 'bg-purple-900/20', text: 'text-purple-300' },
    'meeting': { icon: <FiUsers />, label: 'Réunion', bg: 'bg-indigo-900/20', text: 'text-indigo-300' },
    'call': { icon: <FiPhone />, label: 'Appel', bg: 'bg-green-900/20', text: 'text-green-300' },
    'marketing': { icon: <FiVolume2 />, label: 'Marketing', bg: 'bg-amber-900/20', text: 'text-amber-300' },
    'maintenance': { icon: <FiTool />, label: 'Maintenance', bg: 'bg-teal-900/20', text: 'text-teal-300' }
  };
  
  // Configuration des couleurs de priorité
  const priorityConfig = {
    'high': { color: 'text-rose-300', label: 'Haute' },
    'medium': { color: 'text-amber-300', label: 'Moyenne' },
    'low': { color: 'text-blue-300', label: 'Basse' }
  };
  
  // Fonction pour formater le temps en heures et minutes
  const formatTime = (minutes) => {
    if (!minutes) return '0h';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  };
  
  // Formatage de la date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === now.toDateString()) {
      return 'Aujourd\'hui';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  };
  
  // Obtenir une description du projet associé à l'activité
  const getProjectInfo = (activity) => {
    if (activity.project_name) {
      return { name: activity.project_name, id: activity.project_id };
    }
    
    if (activity.project_id) {
      const project = projects.find(p => p.id === activity.project_id);
      return project ? { name: project.name, id: project.id } : null;
    }
    
    return null;
  };
  
  // Déterminer si une activité est récente (moins de 24h)
  const isRecent = (dateString) => {
    const activityDate = new Date(dateString);
    const now = new Date();
    const diffTime = now - activityDate;
    const diffHours = diffTime / (1000 * 60 * 60);
    return diffHours < 24;
  };
  
  // Trier les activités par date (les plus récentes d'abord)
  const sortedActivities = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Limitez le nombre d'éléments affichés, sauf si expanded est vrai
  const displayedActivities = expanded ? sortedActivities : sortedActivities.slice(0, maxItems);
  
  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5">
      {showTitle && (
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <FiClipboard />
          Flux d'activités récentes
        </h3>
      )}

      <div className="space-y-4">
        {displayedActivities.length > 0 ? (
          <>
            <AnimatePresence initial={false}>
              {displayedActivities.map((activity, index) => {
                const typeInfo = typeConfig[activity.type] || { icon: <FiClipboard />, label: activity.type, bg: 'bg-gray-900/20', text: 'text-gray-300' };
                const priorityInfo = priorityConfig[activity.priority] || { color: 'text-gray-300', label: activity.priority };
                const projectInfo = getProjectInfo(activity);
                
                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className={`p-3 ${typeInfo.bg} rounded-lg relative overflow-hidden ${isRecent(activity.date) ? 'border border-indigo-500/30' : ''}`}
                  >
                    {/* Indicateur pour les activités récentes */}
                    {isRecent(activity.date) && (
                      <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-indigo-500 m-2"></div>
                    )}
                    
                    <div className="flex items-start">
                      {/* Icône du type */}
                      <div className="mr-3 text-lg">{typeInfo.icon}</div>
                      
                      {/* Contenu principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap justify-between items-start">
                          <h4 className="text-white font-medium truncate">{activity.description}</h4>
                          <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{formatDate(activity.date)}</span>
                        </div>
                        
                        <div className="flex flex-wrap items-center mt-1 gap-2">
                          {/* Type */}
                          <span className={`text-xs ${typeInfo.text}`}>{typeInfo.label}</span>
                          
                          {/* Priorité */}
                          <span className={`text-xs ${priorityInfo.color}`}>{priorityInfo.label}</span>
                          
                          {/* Temps */}
                          <span className="text-xs text-gray-400">
                            {activity.status === 'completed' 
                              ? `Terminé (${formatTime(activity.actual_time)})`
                              : `Prévu: ${formatTime(activity.planned_time)}`}
                          </span>
                          
                          {/* Projet associé */}
                          {projectInfo && (
                            <span className="text-xs text-indigo-300 truncate flex items-center gap-1">
                              <FiZap /> {projectInfo.name}
                            </span>
                          )}
                          
                          {/* Lead associé */}
                          {activity.lead_name && (
                            <span className="text-xs text-purple-300 truncate flex items-center gap-1">
                              <FiUser /> {activity.lead_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            {/* Bouton Voir plus/moins */}
            {sortedActivities.length > maxItems && (
              <motion.button
                onClick={() => setExpanded(!expanded)}
                className="w-full py-2 text-sm text-indigo-300 hover:text-indigo-200 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg"
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
              >
                {expanded ? 'Voir moins' : `Voir ${sortedActivities.length - maxItems} activités de plus`}
              </motion.button>
            )}
          </>
        ) : (
          <div className="py-8 text-center">
            <div className="text-4xl mb-3"><FiClipboard /></div>
            <h4 className="text-lg font-medium text-gray-300 mb-2">Aucune activité récente</h4>
            <p className="text-gray-400 text-sm">
              Les activités récentes apparaîtront ici lorsque vous en ajouterez.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityStream;