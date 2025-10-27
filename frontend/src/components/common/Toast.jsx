// src/components/common/Toast.jsx
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCheckCircle, FiXCircle, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi';

const Toast = ({ id, type = 'info', message, duration = 5000, onClose }) => {
  // Configuration par type
  const config = {
    success: {
      icon: <FiCheckCircle className="text-xl" />,
      bgColor: 'from-green-600 to-green-700',
      borderColor: 'border-green-500/50',
      iconColor: 'text-green-200'
    },
    error: {
      icon: <FiXCircle className="text-xl" />,
      bgColor: 'from-red-600 to-red-700',
      borderColor: 'border-red-500/50',
      iconColor: 'text-red-200'
    },
    warning: {
      icon: <FiAlertTriangle className="text-xl" />,
      bgColor: 'from-amber-600 to-amber-700',
      borderColor: 'border-amber-500/50',
      iconColor: 'text-amber-200'
    },
    info: {
      icon: <FiInfo className="text-xl" />,
      bgColor: 'from-indigo-600 to-indigo-700',
      borderColor: 'border-indigo-500/50',
      iconColor: 'text-indigo-200'
    }
  };

  const currentConfig = config[type] || config.info;

  // Auto-dismiss après X secondes
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`
        flex items-start gap-3 p-4 rounded-xl shadow-2xl
        bg-gradient-to-r ${currentConfig.bgColor}
        border ${currentConfig.borderColor}
        backdrop-blur-sm
        min-w-[300px] max-w-[400px]
      `}
    >
      {/* Icône */}
      <div className={`flex-shrink-0 ${currentConfig.iconColor}`}>
        {currentConfig.icon}
      </div>

      {/* Message */}
      <div className="flex-1 text-white text-sm leading-relaxed">
        {message}
      </div>

      {/* Bouton de fermeture */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => onClose(id)}
        className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
      >
        <FiX className="text-lg" />
      </motion.button>

      {/* Barre de progression (si duration > 0) */}
      {duration > 0 && (
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          className="absolute bottom-0 left-0 h-1 bg-white/30 rounded-b-xl origin-left"
          style={{ width: '100%' }}
        />
      )}
    </motion.div>
  );
};

export default Toast;
