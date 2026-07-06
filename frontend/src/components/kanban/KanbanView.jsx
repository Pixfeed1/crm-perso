// src/components/kanban/KanbanView.jsx
//
// Vue Kanban des prospects. Colonnes = les VRAIS statuts du CRM (français, ceux de
// LeadForm/LeadFilter/imports). Le drag & drop délègue la mise à jour au parent
// (onLeadUpdate -> API + état + toasts), un seul appel API. Charte : tokens de thème.
import React, { useState, useEffect, useCallback } from 'react';
import { FiUser, FiBriefcase, FiFileText, FiMessageCircle, FiCheckCircle, FiXCircle, FiTrendingUp } from 'react-icons/fi';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import { leadsAPI } from '../../services/api';

// Anciens statuts anglais (code d'origine) -> statuts réels, pour ne perdre aucun lead.
const LEGACY_STATUS = { new: 'nouveau', contacted: 'contacte', proposal: 'qualifié', negotiation: 'négociation', won: 'client', lost: 'perdu' };
const normStatus = (s) => LEGACY_STATUS[s] || s;

const COLUMNS = [
  { id: 'nouveau', title: 'Nouveau', Icon: FiUser, chip: 'bg-neutral-bg text-neutral-text' },
  { id: 'contacte', title: 'Contacté', Icon: FiMessageCircle, chip: 'bg-info-bg text-info-text' },
  { id: 'prospect', title: 'Prospect', Icon: FiTrendingUp, chip: 'bg-accent/15 text-accent' },
  { id: 'qualifié', title: 'Qualifié', Icon: FiBriefcase, chip: 'bg-warning-bg text-warning-text' },
  { id: 'négociation', title: 'Négociation', Icon: FiFileText, chip: 'bg-warning-bg text-warning-text' },
  { id: 'client', title: 'Client', Icon: FiCheckCircle, chip: 'bg-success-bg text-success-text' },
  { id: 'perdu', title: 'Perdu', Icon: FiXCircle, chip: 'bg-danger-bg text-danger-text' }
];

const KanbanView = ({ leads, onLeadUpdate, onLeadClick }) => {
  const [draggedLead, setDraggedLead] = useState(null);
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await leadsAPI.getKanbanStats();
      setStats(data);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques Kanban:', error);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats, leads]);

  // Organiser les leads par statut (statuts anglais résiduels ramenés vers les français).
  const leadsByStatus = COLUMNS.reduce((acc, column) => {
    acc[column.id] = leads.filter((lead) => normStatus(lead.status) === column.id);
    return acc;
  }, {});

  const handleDragOver = (e) => e.preventDefault(); // nécessaire pour autoriser le drop

  const handleDrop = async (newStatus) => {
    if (!draggedLead || normStatus(draggedLead.status) === newStatus) {
      setDraggedLead(null);
      return;
    }
    try {
      // Le parent fait l'appel API + met à jour l'état + affiche le toast d'erreur.
      await onLeadUpdate(draggedLead.id, { status: newStatus });
      fetchStats();
    } catch (error) {
      // Déjà signalé par le parent (toast) : on annule juste le drop.
    } finally {
      setDraggedLead(null);
    }
  };

  const totals = stats && stats.totals;

  return (
    <div className="h-full flex flex-col">
      {/* Statistiques de conversion */}
      {totals && (
        <div className="mb-4 p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <FiTrendingUp className="text-accent" size={18} />
              <h3 className="text-base font-semibold text-text-primary">Statistiques de conversion</h3>
            </div>
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <div className="text-text-muted text-xs">Taux de gain</div>
                <div className="text-xl font-bold text-success-text">{totals.win_rate}%</div>
              </div>
              <div className="text-center">
                <div className="text-text-muted text-xs">Conversion globale</div>
                <div className="text-xl font-bold text-accent">{totals.conversion_rate}%</div>
              </div>
              <div className="text-center">
                <div className="text-text-muted text-xs">Leads actifs</div>
                <div className="text-xl font-bold text-text-primary">{totals.active_leads}</div>
              </div>
              <div className="text-center">
                <div className="text-text-muted text-xs">Total leads</div>
                <div className="text-xl font-bold text-text-primary">{totals.total_leads}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Colonnes Kanban */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              count={leadsByStatus[column.id].length}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(column.id)}
              isDropTarget={!!draggedLead && normStatus(draggedLead.status) !== column.id}
            >
              {leadsByStatus[column.id].map((lead) => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  onDragStart={() => setDraggedLead(lead)}
                  onDragEnd={() => setDraggedLead(null)}
                  onClick={() => onLeadClick && onLeadClick(lead)}
                  isDragging={draggedLead?.id === lead.id}
                />
              ))}
            </KanbanColumn>
          ))}
        </div>
      </div>
    </div>
  );
};

export default KanbanView;
