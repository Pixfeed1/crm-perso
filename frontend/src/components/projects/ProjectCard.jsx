// src/components/projects/ProjectCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiGlobe, FiSmartphone, FiMonitor, FiEdit2, FiRadio, FiTool, FiPackage, FiClipboard } from 'react-icons/fi';

const ProjectCard = ({ project, isSelected, onClick }) => {
  // S'assurer que le projet a une valeur progress
  const projectProgress = typeof project.progress === 'number' ? project.progress : 0;

  // Configuration des couleurs de statut
  const statusConfig = {
    'en-cours': {
      bg: 'bg-blue-500/20',
      text: 'text-blue-300',
      border: 'border-blue-500/30',
      label: 'En cours'
    },
    'planifié': {
      bg: 'bg-purple-500/20',
      text: 'text-purple-300',
      border: 'border-purple-500/30',
      label: 'Planifié'
    },
    'terminé': {
      bg: 'bg-emerald-500/20',
      text: 'text-emerald-300',
      border: 'border-emerald-500/30',
      label: 'Terminé'
    },
    'pause': {
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      label: 'En pause'
    },
    'annulé': {
      bg: 'bg-rose-500/20',
      text: 'text-rose-300',
      border: 'border-rose-500/30',
      label: 'Annulé'
    }
  };

  // Configuration des icônes de type
  const typeConfig = {
    'site-web': { icon: <FiGlobe />, label: 'Site Web' },
    'application-mobile': { icon: <FiSmartphone />, label: 'App Mobile' },
    'application-bureau': { icon: <FiMonitor />, label: 'App Bureau' },
    'design': { icon: <FiEdit2 />, label: 'Design' },
    'marketing': { icon: <FiRadio />, label: 'Marketing' },
    'maintenance': { icon: <FiTool />, label: 'Maintenance' },
    'autre': { icon: <FiPackage />, label: 'Autre' }
  };

  // Valeurs par défaut si le statut ou type n'est pas configuré
  const statusStyle = statusConfig[project.status] || {
    bg: 'bg-gray-500/20',
    text: 'text-gray-300',
    border: 'border-gray-500/30',
    label: project.status || 'Inconnu'
  };

  const typeInfo = typeConfig[project.type] || { icon: <FiClipboard />, label: project.type || 'Autre' };

  // Format des dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Non définie';
    
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('fr-FR', { 
        day: 'numeric',
        month: 'short'
      }).format(date);
    } catch (error) {
      console.error('Erreur de formatage de date:', error);
      return 'Date invalide';
    }
  };
  
  // Calcul du nombre de jours restants
  const getDaysRemaining = () => {
    if (!project.end_date) return 0;
    
    try {
      const now = new Date();
      const endDate = new Date(project.end_date);
      
      if (isNaN(endDate.getTime())) {
        return 0;
      }
      
      const diffTime = endDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    } catch (error) {
      console.error('Erreur de calcul des jours restants:', error);
      return 0;
    }
  };
  
  const daysRemaining = getDaysRemaining();
  
  // Assurer que le montant est un nombre (compatibilité amount/budget)
  const amount = project.amount || project.budget || 0;
  
  return (
    <motion.div
      className={`rounded-xl p-4 cursor-pointer transition-colors relative overflow-hidden ${
        isSelected ? 'bg-purple-900/40 border-purple-500/50' : 'bg-gray-800/20 hover:bg-gray-800/40 border-transparent'
      } border`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      layout
    >
      {/* Effet de brillance au survol */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        initial={{ x: '-100%' }}
        whileHover={{ x: '100%' }}
        transition={{ duration: 0.6 }}
      />
      
      <div className="relative z-10">
        {/* En-tête avec type et date */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center">
            <span className="text-base mr-2">{typeInfo.icon}</span>
            <span className="text-xs text-gray-400">{typeInfo.label}</span>
          </div>
          <div className={`text-xs px-2 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} font-medium`}>
            {statusStyle.label}
          </div>
        </div>
        
        {/* Titre et client */}
        <div className="mb-3">
          <h3 className="font-semibold text-white">{project.name || 'Projet sans nom'}</h3>
          <p className="text-sm text-purple-300">{project.lead_name || 'Aucun client associé'}</p>
        </div>
        
        {/* Dates */}
        <div className="flex justify-between text-xs text-gray-400 mb-3">
          <div>
            <span className="block">Début: {formatDate(project.start_date)}</span>
            <span className="block">Fin: {formatDate(project.end_date)}</span>
          </div>
          
          {project.status !== 'terminé' && project.status !== 'annulé' && daysRemaining > 0 && (
            <div className={`px-2 py-1 rounded ${
              daysRemaining <= 7 ? 'bg-rose-900/30 text-rose-300' : 'bg-gray-800/50 text-gray-300'
            }`}>
              {daysRemaining} jour{daysRemaining > 1 ? 's' : ''} restant{daysRemaining > 1 ? 's' : ''}
            </div>
          )}
        </div>
        
        {/* Barre de progression */}
        <div className="mt-2">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-gray-400">Progression</span>
            <span className="text-white font-medium">{projectProgress}%</span>
          </div>
          <div className="h-2 bg-gray-800/70 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
              style={{ width: `${projectProgress}%` }}
            />
          </div>
        </div>
        
        {/* Montant */}
        <div className="mt-3 flex justify-end">
          <div className="bg-gray-800/50 px-3 py-1 rounded-lg text-sm font-medium text-white">
            {amount.toLocaleString()} €
          </div>
        </div>
      </div>
      
      {/* Indicateur visuel de sélection */}
      {isSelected && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500"
          layoutId="selectedIndicator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.div>
  );
};

export default ProjectCard;