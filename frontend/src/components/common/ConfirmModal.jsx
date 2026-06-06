// src/components/common/ConfirmModal.jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle, FiTrash2, FiX } from 'react-icons/fi';

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmer l'action",
  message = "Êtes-vous sûr de vouloir continuer ?",
  confirmText = "Confirmer",
  cancelText = "Annuler",
  variant = "danger", // 'danger' ou 'warning'
  itemName = null // Ex: "Lead Jean Dupont"
}) => {
  const config = {
    danger: {
      icon: <FiTrash2 className="text-3xl" />,
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400',
      confirmBg: 'bg-red-600 hover:bg-red-700',
      borderColor: 'border-red-500/30'
    },
    warning: {
      icon: <FiAlertTriangle className="text-3xl" />,
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-400',
      confirmBg: 'bg-amber-600 hover:bg-amber-700',
      borderColor: 'border-amber-500/30'
    }
  };

  const currentConfig = config[variant] || config.danger;

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', duration: 0.3 }}
          className={`
            panel-bg
            border ${currentConfig.borderColor}
            rounded-2xl shadow-2xl
            max-w-md w-full
            overflow-hidden
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 pb-4">
            <div className="flex items-start gap-4">
              {/* Icône */}
              <div className={`${currentConfig.iconBg} ${currentConfig.iconColor} p-3 rounded-xl flex-shrink-0`}>
                {currentConfig.icon}
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  {title}
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {message}
                </p>
                {itemName && (
                  <div className="mt-3 p-3 bg-overlay/5 rounded-lg border border-overlay/10">
                    <p className="text-text-primary font-medium text-sm">{itemName}</p>
                  </div>
                )}
              </div>

              {/* Bouton fermer */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleClose}
                className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
              >
                <FiX className="text-xl" />
              </motion.button>
            </div>
          </div>

          {/* Footer avec boutons */}
          <div className="px-6 py-4 bg-black/20 border-t border-overlay/10 flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 rounded-lg font-medium transition-all"
            >
              {cancelText}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (typeof onConfirm === 'function') {
                  onConfirm();
                }
                if (typeof onClose === 'function') {
                  onClose();
                }
              }}
              className={`flex-1 px-4 py-2.5 ${currentConfig.confirmBg} text-white rounded-lg font-medium transition-colors`}
            >
              {confirmText}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConfirmModal;
