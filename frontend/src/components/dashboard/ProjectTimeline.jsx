// src/components/dashboard/ProjectTimeline.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiCalendar, FiClock } from 'react-icons/fi';

const ProjectTimeline = ({ project }) => {
  // Vérifier si le projet est valide
  if (!project || !project.tasks || project.tasks.length === 0) {
    return (
      <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-5">
        <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
          <FiCalendar />
          Chronologie du projet
        </h3>
        <div className="bg-surface-muted/30 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3"><FiClock /></div>
          <h4 className="text-lg font-medium text-text-secondary mb-2">Pas de chronologie disponible</h4>
          <p className="text-text-muted text-sm">
            Ajoutez des tâches au projet pour visualiser sa chronologie.
          </p>
        </div>
      </div>
    );
  }

  // Format des dates
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', { 
      day: 'numeric',
      month: 'short'
    }).format(date);
  };

  // Calcul de la durée totale du projet en jours
  const getProjectDuration = () => {
    const startDate = new Date(project.start_date);
    const endDate = new Date(project.end_date);
    const diffTime = endDate - startDate;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const projectDuration = getProjectDuration();
  const today = new Date();
  
  // Configuration des couleurs de statut des tâches
  const getTaskStatusColor = (completed) => {
    return completed ? 'bg-emerald-500' : 'bg-indigo-500';
  };

  // Calcul de la position relative de la tâche dans la chronologie
  const calculatePosition = (date) => {
    const startDate = new Date(project.start_date);
    const taskDate = new Date(date);
    const diffTime = taskDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return (diffDays / projectDuration) * 100;
  };

  // Calcul de la position actuelle dans la chronologie
  const calculateTodayPosition = () => {
    const startDate = new Date(project.start_date);
    if (today < startDate) return 0;
    
    const endDate = new Date(project.end_date);
    if (today > endDate) return 100;
    
    const diffTime = today - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return (diffDays / projectDuration) * 100;
  };

  const todayPosition = calculateTodayPosition();

  return (
    <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-5">
      <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
        <FiCalendar />
        Chronologie du projet
      </h3>
      
      {/* Barre de progression globale */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-text-muted mb-1">
          <span>{formatDate(project.start_date)}</span>
          <span>{formatDate(project.end_date)}</span>
        </div>
        <div className="relative h-2 bg-surface-muted rounded-full overflow-hidden">
          {/* Barre de progression jusqu'à aujourd'hui */}
          <div 
            className="absolute h-full bg-purple-600/50"
            style={{ width: `${todayPosition}%` }}
          />
          
          {/* Indicateur de la date d'aujourd'hui */}
          {todayPosition > 0 && todayPosition < 100 && (
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-white"
              style={{ left: `${todayPosition}%` }}
            />
          )}
        </div>
      </div>
      
      {/* Liste des tâches dans la chronologie */}
      <div className="space-y-6">
        {project.tasks.map((task, index) => (
          <motion.div 
            key={task.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="relative"
          >
            <div className="flex items-center">
              <div className={`w-4 h-4 rounded-full ${getTaskStatusColor(task.completed)}`} />
              <div className="ml-3">
                <h4 className={`font-medium ${task.completed ? 'text-text-muted' : 'text-text-primary'}`}>
                  {task.name}
                </h4>
                {task.description && (
                  <p className="text-xs text-text-muted mt-1">{task.description}</p>
                )}
              </div>
              <div className="ml-auto">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  task.completed 
                    ? 'bg-emerald-900/30 text-emerald-300' 
                    : 'bg-surface text-text-muted'
                }`}>
                  {task.completed ? 'Terminé' : 'En attente'}
                </span>
              </div>
            </div>
            
            {/* Représentation visuelle de la tâche dans la chronologie */}
            <div className="mt-2 relative h-8 bg-surface-muted/50 rounded-lg overflow-hidden">
              <motion.div 
                className={`absolute top-0 bottom-0 ${getTaskStatusColor(task.completed)}/30 backdrop-blur-sm`}
                style={{ 
                  left: `${calculatePosition(project.start_date)}%`, 
                  width: `${calculatePosition(project.end_date) - calculatePosition(project.start_date)}%` 
                }}
                initial={{ width: 0 }}
                animate={{ width: `${calculatePosition(project.end_date) - calculatePosition(project.start_date)}%` }}
                transition={{ duration: 0.8 }}
              />
              
              {/* Point pour représenter la tâche */}
              <motion.div 
                className={`absolute top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full ${getTaskStatusColor(task.completed)}`}
                style={{ left: `${task.completed ? calculatePosition(project.end_date) : calculatePosition(project.start_date)}%` }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
      
      {/* Légende */}
      <div className="mt-6 flex items-center justify-end text-xs text-text-muted">
        <div className="flex items-center mr-4">
          <div className="w-3 h-3 bg-purple-600/50 rounded-sm mr-1" />
          <span>Période écoulée</span>
        </div>
        <div className="flex items-center mr-4">
          <div className="w-3 h-3 bg-emerald-500 rounded-full mr-1" />
          <span>Tâche terminée</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-indigo-500 rounded-full mr-1" />
          <span>Tâche en cours</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectTimeline;