// src/components/dashboard/KPIOrb.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const KPIOrb = ({ 
  title, 
  value, 
  subValue, 
  color = "from-blue-500 to-indigo-500", 
  icon,
  size = "md" 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  
  // Définition des tailles - responsive
  const sizeClasses = {
    sm: "w-16 h-16 sm:w-20 sm:h-20 text-base sm:text-lg",
    md: "w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 text-lg sm:text-xl",
    lg: "w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 text-xl sm:text-2xl"
  };
  
  // Animation de pulsation périodique
  useEffect(() => {
    const interval = setInterval(() => {
      setPulsing(true);
      setTimeout(() => setPulsing(false), 1000);
    }, 5000 + Math.random() * 5000); // Pulsation aléatoire pour éviter la synchronisation
    
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="relative flex flex-col items-center justify-center"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.3 }}
    >
      {/* Orbe avec dégradé */}
      <motion.div
        className={`relative rounded-full flex items-center justify-center ${sizeClasses[size]} bg-gradient-to-br ${color} shadow-lg cursor-pointer`}
        animate={{
          boxShadow: pulsing 
            ? "0 0 30px rgba(255, 255, 255, 0.5)" 
            : isHovered 
              ? "0 0 20px rgba(255, 255, 255, 0.3)" 
              : "0 0 10px rgba(255, 255, 255, 0.1)"
        }}
        transition={{ duration: 0.5 }}
      >
        {/* Particules animées sur l'orbe */}
        {Array.from({ length: 5 }).map((_, index) => (
          <motion.div
            key={index}
            className="absolute w-2 h-2 rounded-full bg-overlay/30"
            initial={{ 
              x: 0, 
              y: 0, 
              opacity: 0 
            }}
            animate={{ 
              x: Math.sin(index * Math.PI / 2.5) * 50, 
              y: Math.cos(index * Math.PI / 2.5) * 50,
              opacity: [0, 0.8, 0],
              scale: [0.8, 1.2, 0.8]
            }}
            transition={{ 
              duration: 4 + index, 
              repeat: Infinity, 
              delay: index * 0.8,
              ease: "easeInOut"
            }}
          />
        ))}
        
        {/* Icône */}
        {icon && (
          <div className="absolute top-4 text-2xl">
            {icon}
          </div>
        )}

        {/* Valeur principale */}
        <motion.span 
          className="font-bold text-text-primary"
          animate={{ scale: pulsing ? 1.1 : 1 }}
          transition={{ duration: 0.3 }}
        >
          {value}
        </motion.span>
      </motion.div>
      
      {/* Titre et sous-valeur */}
      <div className="mt-2 sm:mt-3 text-center px-1">
        <motion.h4
          className="font-medium text-indigo-100 text-xs sm:text-sm"
          animate={{ opacity: isHovered ? 1 : 0.8 }}
        >
          {title}
        </motion.h4>

        {subValue && (
          <motion.p
            className="text-xs sm:text-xs text-indigo-300 mt-1"
            initial={{ opacity: 0, y: -10 }}
            animate={{
              opacity: isHovered ? 1 : 0.7,
              y: isHovered ? 0 : -5
            }}
            transition={{ duration: 0.2 }}
          >
            {subValue}
          </motion.p>
        )}
      </div>
      
      {/* Anneaux d'orbite (affichés au survol) */}
      <motion.div
        className="absolute w-full h-full rounded-full border border-white/10"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: isHovered ? 0.3 : 0, 
          scale: isHovered ? 1.2 : 1,
          rotate: isHovered ? 360 : 0
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
      
      <motion.div
        className="absolute w-full h-full rounded-full border border-white/5"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: isHovered ? 0.2 : 0, 
          scale: isHovered ? 1.4 : 1,
          rotate: isHovered ? -360 : 0
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
};

export default KPIOrb;