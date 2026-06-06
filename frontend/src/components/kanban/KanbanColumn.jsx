// src/components/kanban/KanbanColumn.jsx
import React from 'react';
import { motion } from 'framer-motion';

const KanbanColumn = ({ column, leads, count, budget, onDragOver, onDrop, isDraggingOver, children }) => {
  return (
    <motion.div
      className="flex-shrink-0 w-80 flex flex-col"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* En-tête de la colonne */}
      <div className={`p-4 rounded-t-xl bg-gradient-to-r ${column.color} border-b border-overlay/10`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl text-text-primary">{column.icon}</span>
            <h3 className="font-semibold text-text-primary text-lg">{column.title}</h3>
            <span className="text-xs bg-overlay/20 text-text-primary px-2 py-1 rounded-full font-medium">
              {count}
            </span>
          </div>
        </div>
        {budget > 0 && (
          <div className="mt-2 text-xs text-text-primary/80">
            Budget: {new Intl.NumberFormat('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0
            }).format(budget)}
          </div>
        )}
      </div>

      {/* Zone de drop avec scroll */}
      <div
        className={`flex-1 ${column.bgColor} ${column.borderColor} border-x border-b rounded-b-xl p-3 overflow-y-auto transition-all duration-200 ${
          isDraggingOver ? 'bg-opacity-30 border-opacity-50' : 'border-opacity-20'
        }`}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{ minHeight: '500px', maxHeight: 'calc(100vh - 300px)' }}
      >
        <div className="space-y-3">
          {children}
          {leads.length === 0 && (
            <div className="text-center text-text-muted text-sm py-8">
              Aucun lead dans cette colonne
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default KanbanColumn;
