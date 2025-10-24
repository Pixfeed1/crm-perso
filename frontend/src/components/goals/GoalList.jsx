// src/components/goals/GoalList.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiUsers, FiDollarSign, FiSettings, FiMegaphone, FiStar, FiCheckCircle, FiClock, FiZap, FiAlertCircle, FiMinusCircle, FiTarget, FiMapPin } from 'react-icons/fi';

const GoalList = ({ goals, selectedGoal, onSelectGoal }) => {
  // Fonction pour calculer le pourcentage de progression
  const calculateProgress = (current, target) => {
    return Math.min(100, Math.round((current / target) * 100));
  };

  // Formatage des dates
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short'
    });
  };

  // Configuration des couleurs de catégorie
  const categoryConfig = {
    'leads': { icon: <FiUsers />, label: 'Leads', color: 'text-blue-300' },
    'revenue': { icon: <FiDollarSign />, label: 'Revenus', color: 'text-emerald-300' },
    'productivity': { icon: <FiSettings />, label: 'Productivité', color: 'text-purple-300' },
    'marketing': { icon: <FiMegaphone />, label: 'Marketing', color: 'text-amber-300' },
    'personal': { icon: <FiStar />, label: 'Personnel', color: 'text-rose-300' }
  };

  // Configuration des couleurs de période
  const periodConfig = {
    'monthly': { label: 'Mensuel', color: 'text-blue-300' },
    'quarterly': { label: 'Trimestriel', color: 'text-purple-300' },
    'yearly': { label: 'Annuel', color: 'text-amber-300' }
  };

  // Vérifier si un objectif est actif (en cours)
  const isActive = (goal) => {
    const now = new Date();
    const startDate = new Date(goal.start_date);
    const endDate = new Date(goal.end_date);
    return startDate <= now && endDate >= now;
  };

  // Vérifier si un objectif est à venir
  const isUpcoming = (goal) => {
    const now = new Date();
    const startDate = new Date(goal.start_date);
    return startDate > now;
  };

  // Vérifier si un objectif est complété
  const isCompleted = (goal) => {
    return goal.current_value >= goal.target_value;
  };

  // Vérifier si un objectif est expiré (passé la date de fin)
  const isExpired = (goal) => {
    const now = new Date();
    const endDate = new Date(goal.end_date);
    return endDate < now && !isCompleted(goal);
  };

  // Obtenir le statut de l'objectif
  const getGoalStatus = (goal) => {
    if (isCompleted(goal)) {
      return { text: 'Complété', color: 'bg-green-900/30 text-green-300', icon: <FiCheckCircle /> };
    } else if (isUpcoming(goal)) {
      return { text: 'À venir', color: 'bg-purple-900/30 text-purple-300', icon: <FiClock /> };
    } else if (isActive(goal)) {
      return { text: 'En cours', color: 'bg-blue-900/30 text-blue-300', icon: <FiZap /> };
    } else if (isExpired(goal)) {
      return { text: 'Expiré', color: 'bg-rose-900/30 text-rose-300', icon: <FiAlertCircle /> };
    } else {
      return { text: 'Inactif', color: 'bg-gray-900/30 text-gray-300', icon: <FiMinusCircle /> };
    }
  };
  
  // Calculer le temps restant
  const getTimeRemaining = (goal) => {
    if (!isActive(goal)) return null;
    
    const now = new Date();
    const endDate = new Date(goal.end_date);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `${diffDays} jour${diffDays > 1 ? 's' : ''} restant${diffDays > 1 ? 's' : ''}`;
  };
  
  // Trier les objectifs par statut puis par date de fin
  const sortedGoals = [...goals].sort((a, b) => {
    // D'abord trier par statut: en cours > à venir > expiré > complété
    const statusA = isActive(a) ? 0 : isUpcoming(a) ? 1 : isExpired(a) ? 2 : 3;
    const statusB = isActive(b) ? 0 : isUpcoming(b) ? 1 : isExpired(b) ? 2 : 3;
    
    if (statusA !== statusB) {
      return statusA - statusB;
    }
    
    // Ensuite trier par date de fin (la plus proche d'abord)
    return new Date(a.end_date) - new Date(b.end_date);
  });
  
  if (goals.length === 0) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 text-center">
        <div className="text-5xl mb-4"><FiTarget /></div>
        <h4 className="text-lg font-medium text-white mb-2">Sélectionnez un objectif dans la liste ou créez-en un nouveau</h4>
        <p className="text-gray-300 text-sm">
          Aucun objectif trouvé pour cette période ou avec ces filtres.
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex-1 space-y-4">
      {sortedGoals.map(goal => {
        const isSelected = selectedGoal && selectedGoal.id === goal.id;
        const progress = calculateProgress(goal.current_value, goal.target_value);
        const statusInfo = getGoalStatus(goal);
        const timeRemaining = getTimeRemaining(goal);
        const categoryInfo = categoryConfig[goal.category] || { icon: <FiMapPin />, label: goal.category, color: 'text-gray-300' };
        const periodInfo = periodConfig[goal.period] || { label: goal.period, color: 'text-gray-300' };
        
        return (
          <motion.div
            key={goal.id}
            className={`p-4 rounded-xl cursor-pointer ${isSelected ? 'bg-amber-900/30' : 'bg-gray-800/50 hover:bg-gray-800/70'}`}
            whileHover={{ scale: 1.01 }}
            onClick={() => onSelectGoal(goal)}
            layout
          >
            <div className="flex justify-between">
              <div className="flex-1">
                <div className="flex items-center mb-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color} mr-2`}>
                    <span className="mr-1">{statusInfo.icon}</span>
                    {statusInfo.text}
                    {timeRemaining && <span className="ml-1">({timeRemaining})</span>}
                  </span>
                  
                  <span className={`flex items-center ${categoryInfo.color} text-xs mr-2 px-2 py-1 bg-gray-800/70 rounded-md`}>
                    <span className="mr-1">{categoryInfo.icon}</span>
                    {categoryInfo.label}
                  </span>
                  
                  <span className={`${periodInfo.color} text-xs px-2 py-1 bg-gray-800/70 rounded-md`}>
                    {periodInfo.label}
                  </span>
                </div>
                
                <h3 className="font-medium text-white text-lg">{goal.name}</h3>
                
                <div className="flex justify-between text-xs text-gray-400 mt-1 mb-2">
                  <span>{formatDate(goal.start_date)}</span>
                  <span>→</span>
                  <span>{formatDate(goal.end_date)}</span>
                </div>
                
                {/* Barre de progression */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Progression</span>
                    <span className="text-white font-medium">{progress}%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        progress >= 100 
                          ? 'bg-green-500' 
                          : progress >= 75 
                            ? 'bg-amber-500' 
                            : progress >= 50 
                              ? 'bg-blue-500' 
                              : 'bg-purple-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col justify-between items-end ml-4">
                <div className="text-lg font-bold text-white">
                  {goal.current_value}{goal.category === 'revenue' ? ' €' : ''}
                  <span className="text-gray-500 text-sm"> / {goal.target_value}{goal.category === 'revenue' ? ' €' : ''}</span>
                </div>
                
                {goal.milestones && goal.milestones.length > 0 && (
                  <div className="text-xs text-gray-400 mt-2">
                    {goal.milestones.filter(m => m.achieved).length} / {goal.milestones.length} étapes
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default GoalList;