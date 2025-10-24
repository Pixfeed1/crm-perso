// src/components/dashboard/GoalProgress.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const GoalProgress = ({ 
  title, 
  current, 
  target, 
  period,
  color = "blue",
  format = "number" 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Calcul du pourcentage de progression
  const percentage = Math.min(100, Math.round((current / target) * 100));
  
  // Configuration des couleurs en fonction du paramètre
  const colorConfig = {
    blue: {
      light: 'rgba(59, 130, 246, 0.2)',
      medium: 'rgba(59, 130, 246, 0.5)',
      strong: 'rgba(59, 130, 246, 1)',
      text: 'text-blue-300'
    },
    purple: {
      light: 'rgba(168, 85, 247, 0.2)',
      medium: 'rgba(168, 85, 247, 0.5)',
      strong: 'rgba(168, 85, 247, 1)',
      text: 'text-purple-300'
    },
    emerald: {
      light: 'rgba(16, 185, 129, 0.2)',
      medium: 'rgba(16, 185, 129, 0.5)',
      strong: 'rgba(16, 185, 129, 1)',
      text: 'text-emerald-300'
    },
    amber: {
      light: 'rgba(245, 158, 11, 0.2)',
      medium: 'rgba(245, 158, 11, 0.5)',
      strong: 'rgba(245, 158, 11, 1)',
      text: 'text-amber-300'
    },
    rose: {
      light: 'rgba(244, 63, 94, 0.2)',
      medium: 'rgba(244, 63, 94, 0.5)',
      strong: 'rgba(244, 63, 94, 1)',
      text: 'text-rose-300'
    }
  };
  
  // Formatage des valeurs
  const formatValue = (value) => {
    if (format === 'currency') {
      return `${value.toLocaleString()} €`;
    }
    return value.toLocaleString();
  };
  
  // Génération des bulles d'arrière-plan
  const generateBubbles = () => {
    return Array.from({ length: 10 }).map((_, index) => {
      const size = 10 + Math.random() * 40;
      const posX = Math.random() * 100;
      const posY = Math.random() * 100;
      const delay = Math.random() * 5;
      const duration = 10 + Math.random() * 20;
      
      return (
        <motion.div 
          key={index}
          className="absolute rounded-full opacity-10"
          style={{
            backgroundColor: colorConfig[color].strong,
            width: size,
            height: size,
            left: `${posX}%`,
            top: `${posY}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.1, 0.2, 0.1],
            scale: [1, 1.2, 1]
          }}
          transition={{
            duration: duration,
            repeat: Infinity,
            delay: delay,
            ease: "easeInOut"
          }}
        />
      );
    });
  };

  return (
    <motion.div 
      className="relative bg-gray-800/50 rounded-xl p-4 overflow-hidden"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {/* Bulles d'arrière-plan animées */}
      {generateBubbles()}
      
      {/* Contenu principal */}
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className={`font-semibold ${colorConfig[color].text}`}>{title}</h3>
            <p className="text-xs text-gray-400">{period}</p>
          </div>
          <motion.div 
            className="text-xl font-bold text-white"
            animate={{ scale: isHovered ? 1.1 : 1 }}
          >
            {percentage}%
          </motion.div>
        </div>
        
        {/* Barre de progression stylisée */}
        <div className="mt-4 h-3 bg-gray-700/50 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: colorConfig[color].strong }}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
        
        {/* Valeurs actuelles et cibles */}
        <div className="flex justify-between mt-2 text-sm">
          <div>
            <span className="text-gray-400">Actuel: </span>
            <span className="text-white font-medium">{formatValue(current)}</span>
          </div>
          <div>
            <span className="text-gray-400">Cible: </span>
            <span className="text-white font-medium">{formatValue(target)}</span>
          </div>
        </div>
        
        {/* Astuce contextuelle au survol */}
        <motion.div
          className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/70 to-transparent text-xs"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
        >
          <span className={colorConfig[color].text}>
            {percentage < 50 ? 'En retard' : percentage < 80 ? 'En progression' : 'En bonne voie'}
          </span>
          <span className="text-gray-400 ml-1">
            {percentage < 50 
              ? '- Besoin d\'intensifier les efforts' 
              : percentage < 80 
                ? '- Continuez ainsi' 
                : '- Objectif presque atteint!'
            }
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default GoalProgress;