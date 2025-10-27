// src/components/projects/TaskList.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClipboard, FiBarChart2 } from 'react-icons/fi';

const TaskList = ({ tasks = [], onToggleStatus }) => {
  // Si aucune tâche n'est disponible
  if (tasks.length === 0) {
    return (
      <div className="bg-gray-900/30 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3"><FiClipboard /></div>
        <h4 className="text-lg font-medium text-gray-300 mb-2">Aucune tâche</h4>
        <p className="text-gray-400 text-sm">
          Ajoutez des tâches pour suivre l'avancement de ce projet.
        </p>
      </div>
    );
  }

  // Calcul des statistiques de tâches
  const completedTasks = tasks.filter(task => task.completed).length;
  const completionPercentage = Math.round((completedTasks / tasks.length) * 100);

  return (
    <div>
      {/* Résumé des tâches */}
      <div className="mb-4 bg-gray-900/30 p-4 rounded-lg flex flex-wrap gap-4 justify-between items-center">
        <div className="flex items-center">
          <div className="text-2xl mr-3"><FiBarChart2 /></div>
          <div>
            <h4 className="font-medium text-white">{completedTasks} sur {tasks.length} tâches complétées</h4>
            <div className="text-sm text-gray-400">{completionPercentage}% terminé</div>
          </div>
        </div>
        
        <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            transition={{ duration: 0.7 }}
          />
        </div>
      </div>
      
      {/* Liste des tâches */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {tasks.map(task => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className={`p-3 rounded-lg flex items-center justify-between ${
                task.completed ? 'bg-purple-900/20' : 'bg-gray-800/50'
              }`}
            >
              <div className="flex items-center">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border mr-3 flex items-center justify-center ${
                    task.completed 
                      ? 'bg-purple-600 border-purple-500' 
                      : 'border-gray-600 hover:border-purple-500'
                  }`}
                  onClick={() => onToggleStatus(task.id)}
                >
                  {task.completed && (
                    <motion.svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="12" 
                      height="12" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="3" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-white"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </motion.svg>
                  )}
                </motion.button>
                
                <span className={`${task.completed ? 'text-gray-400 line-through' : 'text-white'}`}>
                  {task.name}
                </span>
              </div>
              
              {/* Afficher une étiquette "Terminé" pour les tâches complétées */}
              {task.completed && (
                <span className="text-xs bg-purple-900/30 text-purple-300 px-2 py-1 rounded">
                  Terminé
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TaskList;