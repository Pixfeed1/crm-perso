// src/components/kanban/KanbanCard.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiMail, FiPhone, FiBriefcase, FiDollarSign, FiUser } from 'react-icons/fi';

const KanbanCard = ({ lead, onDragStart, onDragEnd, onClick, isDragging }) => {
  return (
    <motion.div
      className={`bg-surface/50 backdrop-blur-sm border border-border rounded-lg p-4 cursor-move hover:bg-surface-strong/50 transition-all ${
        isDragging ? 'opacity-50 scale-95' : 'opacity-100'
      }`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        // Ne pas déclencher onClick si on est en train de drag
        if (!isDragging) {
          onClick();
        }
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {/* Nom du lead */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="text-text-primary font-semibold text-base mb-1">{lead.name}</h4>
          {lead.company && (
            <div className="flex items-center gap-1 text-text-muted text-sm">
              <FiBriefcase className="text-xs" />
              <span>{lead.company}</span>
            </div>
          )}
        </div>
        {lead.type === 'company' && (
          <div className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded text-xs">
            Entreprise
          </div>
        )}
        {lead.type === 'individual' && (
          <div className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs flex items-center gap-1">
            <FiUser className="text-xs" />
            Individuel
          </div>
        )}
      </div>

      {/* Informations de contact */}
      <div className="space-y-2 mb-3">
        {lead.email && (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <FiMail className="text-indigo-400 text-xs flex-shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <FiPhone className="text-green-400 text-xs flex-shrink-0" />
            <span>{lead.phone}</span>
          </div>
        )}
      </div>

      {/* Budget */}
      {lead.budget && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <FiDollarSign className="text-amber-400" />
          <span className="text-amber-400 font-semibold">
            {new Intl.NumberFormat('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0
            }).format(lead.budget)}
          </span>
        </div>
      )}

      {/* Source */}
      {lead.source && (
        <div className="mt-2">
          <span className="text-xs text-gray-500">
            Source: {lead.source}
          </span>
        </div>
      )}

      {/* Date de création */}
      {lead.created_at && (
        <div className="mt-2 text-xs text-gray-500">
          Créé le {new Date(lead.created_at).toLocaleDateString('fr-FR')}
        </div>
      )}
    </motion.div>
  );
};

export default KanbanCard;
