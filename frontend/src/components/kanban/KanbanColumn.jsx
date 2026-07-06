// src/components/kanban/KanbanColumn.jsx
// Colonne du Kanban prospects. Charte : tokens de thème uniquement (pas de couleur en dur).
import React from 'react';
import { motion } from 'framer-motion';

const KanbanColumn = ({ column, count, onDragOver, onDrop, isDropTarget, children }) => {
  const { Icon } = column;
  return (
    <motion.div
      className="flex-shrink-0 w-72 flex flex-col"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* En-tête de la colonne */}
      <div className="p-3 rounded-t-xl bg-surface border border-b-0 border-border flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${column.chip}`}>
          <Icon size={14} />
        </span>
        <h3 className="font-semibold text-text-primary text-sm">{column.title}</h3>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${column.chip}`}>{count}</span>
      </div>

      {/* Zone de drop avec scroll */}
      <div
        className={`flex-1 bg-surface/40 border border-border rounded-b-xl p-2.5 overflow-y-auto transition-colors ${
          isDropTarget ? 'border-accent/60 bg-accent/5' : ''
        }`}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{ minHeight: '400px', maxHeight: 'calc(100vh - 300px)' }}
      >
        <div className="space-y-2.5">
          {children}
          {count === 0 && (
            <div className="text-center text-text-muted text-xs py-8">Aucun lead</div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default KanbanColumn;
