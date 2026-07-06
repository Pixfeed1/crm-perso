// src/components/kanban/KanbanCard.jsx
// Carte d'un prospect dans le Kanban. Charte : tokens de thème ; libellés scrapés décodés
// (entités HTML) comme dans le Suivi. Pas de champ budget : il n'existe pas sur les leads.
import React from 'react';
import { motion } from 'framer-motion';
import { FiMail, FiPhone, FiBriefcase, FiUser } from 'react-icons/fi';
import { decodeHtml } from '../../utils/decodeHtml';

const KanbanCard = ({ lead, onDragStart, onDragEnd, onClick, isDragging }) => {
  return (
    <motion.div
      className={`bg-surface border border-border rounded-lg p-3 cursor-move hover:border-border-strong transition-all ${
        isDragging ? 'opacity-50 scale-95' : 'opacity-100'
      }`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => { if (!isDragging) onClick(); }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.15 }}
    >
      {/* Nom du lead */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-text-primary font-semibold text-sm mb-0.5 truncate">{decodeHtml(lead.name)}</h4>
          {lead.company && (
            <div className="flex items-center gap-1 text-text-muted text-xs">
              <FiBriefcase size={11} className="flex-shrink-0" />
              <span className="truncate">{decodeHtml(lead.company)}</span>
            </div>
          )}
        </div>
        {lead.type === 'company' && (
          <span className="bg-accent/15 text-accent px-2 py-0.5 rounded-full text-xs flex-shrink-0">Entreprise</span>
        )}
        {lead.type === 'individual' && (
          <span className="bg-info-bg text-info-text px-2 py-0.5 rounded-full text-xs flex items-center gap-1 flex-shrink-0">
            <FiUser size={11} /> Individuel
          </span>
        )}
      </div>

      {/* Informations de contact */}
      {(lead.email || lead.phone) && (
        <div className="space-y-1 mb-2">
          {lead.email && (
            <div className="flex items-center gap-1.5 text-text-secondary text-xs">
              <FiMail size={11} className="text-text-muted flex-shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-text-secondary text-xs">
              <FiPhone size={11} className="text-text-muted flex-shrink-0" />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>
      )}

      {/* Source + date de création */}
      <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
        {lead.source ? <span className="truncate">Source : {lead.source}</span> : <span />}
        {lead.created_at && <span className="flex-shrink-0">{new Date(lead.created_at).toLocaleDateString('fr-FR')}</span>}
      </div>
    </motion.div>
  );
};

export default KanbanCard;
