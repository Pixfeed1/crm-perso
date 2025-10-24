// src/components/goals/GoalDetails.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GoalDetails = ({ 
  goal, 
  onUpdate, 
  onDelete, 
  onAddMilestone, 
  onUpdateMilestone 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [milestoneData, setMilestoneData] = useState({
    name: '',
    target: 0
  });
  const [editData, setEditData] = useState({
    current_value: goal.current_value
  });
  
  // Fonction pour calculer le pourcentage de progression
  const calculateProgress = (current, target) => {
    return Math.min(100, Math.round((current / target) * 100));
  };
  
  // Formatage des dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Non défini';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Erreur de formatage de date:', error);
      return 'Date invalide';
    }
  };
  
  // Configuration des couleurs de catégorie
  const categoryConfig = {
    'leads': { icon: '👥', label: 'Leads', color: 'text-blue-300' },
    'revenue': { icon: '💰', label: 'Revenus', color: 'text-emerald-300' },
    'productivity': { icon: '⚙️', label: 'Productivité', color: 'text-purple-300' },
    'marketing': { icon: '📢', label: 'Marketing', color: 'text-amber-300' },
    'personal': { icon: '🌱', label: 'Personnel', color: 'text-rose-300' }
  };
  
  // Configuration des couleurs de période
  const periodConfig = {
    'monthly': { label: 'Mensuel', color: 'text-blue-300' },
    'quarterly': { label: 'Trimestriel', color: 'text-purple-300' },
    'yearly': { label: 'Annuel', color: 'text-amber-300' }
  };
  
  // Vérifier si un objectif est actif (en cours)
  const isActive = () => {
    const now = new Date();
    const startDate = new Date(goal.start_date);
    const endDate = new Date(goal.end_date);
    return startDate <= now && endDate >= now;
  };
  
  // Vérifier si un objectif est à venir
  const isUpcoming = () => {
    const now = new Date();
    const startDate = new Date(goal.start_date);
    return startDate > now;
  };
  
  // Vérifier si un objectif est complété
  const isCompleted = () => {
    return goal.current_value >= goal.target_value;
  };
  
  // Vérifier si un objectif est expiré (passé la date de fin)
  const isExpired = () => {
    const now = new Date();
    const endDate = new Date(goal.end_date);
    return endDate < now && !isCompleted();
  };
  
  // Obtenir le statut de l'objectif
  const getGoalStatus = () => {
    if (isCompleted()) {
      return { text: 'Complété', color: 'bg-green-900/30 text-green-300', icon: '✓' };
    } else if (isUpcoming()) {
      return { text: 'À venir', color: 'bg-purple-900/30 text-purple-300', icon: '🔮' };
    } else if (isActive()) {
      return { text: 'En cours', color: 'bg-blue-900/30 text-blue-300', icon: '⚡' };
    } else if (isExpired()) {
      return { text: 'Expiré', color: 'bg-rose-900/30 text-rose-300', icon: '⏰' };
    } else {
      return { text: 'Inactif', color: 'bg-gray-900/30 text-gray-300', icon: '📌' };
    }
  };
  
  // Calculer le temps restant
  const getTimeRemaining = () => {
    if (!isActive()) return null;
    
    const now = new Date();
    const endDate = new Date(goal.end_date);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `${diffDays} jour${diffDays > 1 ? 's' : ''} restant${diffDays > 1 ? 's' : ''}`;
  };
  
  // Mise à jour de la valeur actuelle uniquement
  const handleUpdateCurrentValue = () => {
    // Conversion explicite en nombre et validation
    const numericValue = parseFloat(editData.current_value);
    
    if (isNaN(numericValue)) {
      alert("Veuillez entrer une valeur numérique valide");
      return;
    }
    
    // N'envoyer que la valeur current_value, sans autres propriétés
    onUpdate({ current_value: numericValue });
    setIsEditing(false);
  };
  
  const handleSubmitMilestone = () => {
    if (!milestoneData.name || milestoneData.target <= 0) {
      alert("Veuillez entrer un nom et une valeur cible valide");
      return;
    }
    
    onAddMilestone(milestoneData);
    setIsAddingMilestone(false);
    setMilestoneData({ name: '', target: 0 });
  };
  
  const progress = calculateProgress(goal.current_value, goal.target_value);
  const statusInfo = getGoalStatus();
  const timeRemaining = getTimeRemaining();
  const categoryInfo = categoryConfig[goal.category] || { icon: '📌', label: goal.category, color: 'text-gray-300' };
  const periodInfo = periodConfig[goal.period] || { label: goal.period, color: 'text-gray-300' };
  
  return (
    <div className="h-full">
      {/* En-tête avec actions */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-300">
            {goal.name}
          </h2>
          <div className="flex items-center mt-2 space-x-2">
            <span className={`flex items-center ${categoryInfo.color}`}>
              <span className="mr-1">{categoryInfo.icon}</span>
              <span className="capitalize">{categoryInfo.label}</span>
            </span>
            <span className="text-gray-500">•</span>
            <span className={periodInfo.color}>
              {periodInfo.label}
            </span>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-300"
            onClick={() => setIsEditing(true)}
          >
            ✏️
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
            onClick={() => setShowDeleteConfirm(true)}
          >
            🗑️
          </motion.button>
        </div>
      </div>
      
      {/* Statut de l'objectif */}
      <div className="mb-6">
        <div className={`px-4 py-2 rounded-lg flex items-center ${statusInfo.color}`}>
          <span className="mr-2">{statusInfo.icon}</span>
          {statusInfo.text}
          {timeRemaining && (
            <span className="ml-2 text-sm">({timeRemaining})</span>
          )}
        </div>
      </div>
      
      {/* Progression */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5 mb-6">
        <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center">
          <span className="mr-2">📈</span>
          Progression
        </h3>
        
        {/* Barre de progression */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Progression actuelle</span>
            <span className="text-white font-medium">{progress}%</span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <motion.div 
              className={`h-full rounded-full ${
                progress >= 100 
                  ? 'bg-green-500' 
                  : progress >= 75 
                    ? 'bg-amber-500' 
                    : progress >= 50 
                      ? 'bg-blue-500' 
                      : 'bg-purple-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>
        </div>
        
        {/* Valeurs actuelles/cibles */}
        <div className="flex justify-between items-center mt-4">
          <div>
            <div className="text-sm text-gray-400">Valeur actuelle</div>
            <div className="text-xl font-bold text-white">{goal.current_value}{goal.category === 'revenue' ? ' €' : ''}</div>
          </div>
          <div className="text-2xl text-gray-500">/</div>
          <div>
            <div className="text-sm text-gray-400">Objectif</div>
            <div className="text-xl font-bold text-white">{goal.target_value}{goal.category === 'revenue' ? ' €' : ''}</div>
          </div>
        </div>
        
        {/* Formulaire de mise à jour */}
        <AnimatePresence>
          {isEditing && (
            <motion.div 
              className="mt-4 pt-4 border-t border-gray-700"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <h4 className="text-sm font-medium text-gray-300 mb-2">Mettre à jour la progression</h4>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  value={editData.current_value}
                  onChange={(e) => setEditData({ current_value: e.target.value })}
                  className="flex-1 bg-white text-gray-800 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  step="0.01"
                  min="0"
                />
                <motion.button
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleUpdateCurrentValue}
                >
                  Mettre à jour
                </motion.button>
                <motion.button
                  className="p-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsEditing(false)}
                >
                  Annuler
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Informations détaillées */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5 mb-6">
        <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center">
          <span className="mr-2">📋</span>
          Détails
        </h3>
        
        <div className="space-y-4">
          <div>
            <h4 className="text-sm text-gray-400">Description</h4>
            <p className="mt-1 text-white">{goal.description || 'Aucune description'}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm text-gray-400">Date de début</h4>
              <p className="mt-1 text-white">{formatDate(goal.start_date)}</p>
            </div>
            <div>
              <h4 className="text-sm text-gray-400">Date de fin</h4>
              <p className="mt-1 text-white">{formatDate(goal.end_date)}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm text-gray-400">Créé le</h4>
              <p className="mt-1 text-white">{formatDate(goal.created_at)}</p>
            </div>
            <div>
              <h4 className="text-sm text-gray-400">Dernière mise à jour</h4>
              <p className="mt-1 text-white">{formatDate(goal.updated_at)}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Étapes (Milestones) */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-200 flex items-center">
            <span className="mr-2">🏆</span>
            Étapes
          </h3>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 px-3 py-1 rounded-lg text-sm flex items-center"
            onClick={() => setIsAddingMilestone(true)}
          >
            <span className="mr-1">+</span>
            Ajouter une étape
          </motion.button>
        </div>
        
        {/* Liste des étapes */}
        <div className="space-y-3">
          {goal.milestones && goal.milestones.length > 0 ? (
            goal.milestones.map(milestone => (
              <div
                key={milestone.id}
                className={`p-3 rounded-lg flex justify-between items-center ${
                  milestone.achieved ? 'bg-green-900/20 border-green-500/30' : 'bg-gray-800/50'
                } border`}
              >
                <div className="flex items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${
                    milestone.achieved 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {milestone.achieved ? '✓' : '○'}
                  </div>
                  <div>
                    <div className="font-medium text-white">{milestone.name}</div>
                    <div className="text-sm text-gray-400">
                      Objectif: {milestone.target}
                      {goal.category === 'revenue' ? ' €' : ''}
                    </div>
                  </div>
                </div>
                
                {!milestone.achieved && goal.current_value >= milestone.target && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
                    onClick={() => onUpdateMilestone(milestone.id, true)}
                  >
                    Marquer comme atteint
                  </motion.button>
                )}
                
                {milestone.achieved && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
                    onClick={() => onUpdateMilestone(milestone.id, false)}
                  >
                    Annuler
                  </motion.button>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-gray-400">
              Aucune étape définie. Ajoutez des étapes intermédiaires pour suivre votre progression.
            </div>
          )}
        </div>
        
        {/* Formulaire d'ajout d'étape */}
        <AnimatePresence>
          {isAddingMilestone && (
            <motion.div 
              className="mt-4 pt-4 border-t border-gray-700"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <h4 className="text-sm font-medium text-gray-300 mb-2">Nouvelle étape</h4>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nom de l'étape"
                  value={milestoneData.name}
                  onChange={(e) => setMilestoneData({ ...milestoneData, name: e.target.value })}
                  className="w-full bg-white text-gray-800 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    placeholder="Valeur cible"
                    value={milestoneData.target}
                    onChange={(e) => setMilestoneData({ ...milestoneData, target: parseFloat(e.target.value) })}
                    className="flex-1 bg-white text-gray-800 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    step="0.01"
                    min="0"
                  />
                  <motion.button
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSubmitMilestone}
                    disabled={!milestoneData.name || milestoneData.target <= 0}
                  >
                    Ajouter
                  </motion.button>
                  <motion.button
                    className="p-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsAddingMilestone(false)}
                  >
                    Annuler
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Popup de confirmation de suppression */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-xl font-semibold text-white mb-2">Confirmer la suppression</h3>
              <p className="text-gray-300 mb-6">
                Êtes-vous sûr de vouloir supprimer définitivement cet objectif ? Cette action ne peut pas être annulée.
              </p>
              
              <div className="flex justify-end space-x-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </motion.button>
                
                <motion.button
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onDelete}
                >
                  Supprimer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GoalDetails;