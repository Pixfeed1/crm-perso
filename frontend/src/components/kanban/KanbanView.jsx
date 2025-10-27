// src/components/kanban/KanbanView.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiBriefcase, FiFileText, FiMessageCircle, FiCheckCircle, FiXCircle, FiTrendingUp } from 'react-icons/fi';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import { leadsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const KanbanView = ({ leads, onLeadUpdate, onLeadSelect }) => {
  const { toast } = useToast();
  const [draggedLead, setDraggedLead] = useState(null);
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Configuration des colonnes Kanban
  const columns = [
    {
      id: 'new',
      title: 'Nouveau',
      icon: <FiUser />,
      color: 'from-gray-500 to-gray-600',
      bgColor: 'bg-gray-500/10',
      borderColor: 'border-gray-500/30'
    },
    {
      id: 'contacted',
      title: 'Contacté',
      icon: <FiMessageCircle />,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30'
    },
    {
      id: 'proposal',
      title: 'Proposition',
      icon: <FiFileText />,
      color: 'from-indigo-500 to-indigo-600',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/30'
    },
    {
      id: 'negotiation',
      title: 'Négociation',
      icon: <FiBriefcase />,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30'
    },
    {
      id: 'won',
      title: 'Gagné',
      icon: <FiCheckCircle />,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30'
    },
    {
      id: 'lost',
      title: 'Perdu',
      icon: <FiXCircle />,
      color: 'from-red-500 to-red-600',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30'
    }
  ];

  // Charger les statistiques
  useEffect(() => {
    fetchStats();
  }, [leads]);

  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const data = await leadsAPI.getKanbanStats();
      setStats(data);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques Kanban:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Organiser les leads par statut
  const leadsByStatus = columns.reduce((acc, column) => {
    acc[column.id] = leads.filter(lead => lead.status === column.id);
    return acc;
  }, {});

  // Gestion du drag & drop
  const handleDragStart = (lead) => {
    setDraggedLead(lead);
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Nécessaire pour permettre le drop
  };

  const handleDrop = async (newStatus) => {
    if (!draggedLead || draggedLead.status === newStatus) {
      setDraggedLead(null);
      return;
    }

    try {
      // Mettre à jour le statut du lead via l'API
      await leadsAPI.update(draggedLead.id, { status: newStatus });

      // Notifier le parent de la mise à jour
      onLeadUpdate(draggedLead.id, { ...draggedLead, status: newStatus });

      // Rafraîchir les statistiques
      fetchStats();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du lead:', error);
      toast.error('Erreur lors du déplacement du lead');
    } finally {
      setDraggedLead(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedLead(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Statistiques de conversion */}
      {!isLoadingStats && stats && (
        <motion.div
          className="mb-4 p-4 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 rounded-xl border border-indigo-500/30"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <FiTrendingUp className="text-indigo-300 text-xl" />
              <h3 className="text-lg font-semibold text-white">Statistiques de Conversion</h3>
            </div>
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <div className="text-gray-400">Taux de gain</div>
                <div className="text-2xl font-bold text-green-400">{stats.totals.win_rate}%</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Conversion globale</div>
                <div className="text-2xl font-bold text-indigo-400">{stats.totals.conversion_rate}%</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Leads actifs</div>
                <div className="text-2xl font-bold text-white">{stats.totals.active_leads}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Budget total</div>
                <div className="text-2xl font-bold text-amber-400">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.totals.total_budget)}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Colonnes Kanban */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              leads={leadsByStatus[column.id] || []}
              count={stats?.by_status[column.id]?.count || 0}
              budget={stats?.by_status[column.id]?.total_budget || 0}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(column.id)}
              isDraggingOver={draggedLead?.status !== column.id}
            >
              <AnimatePresence>
                {(leadsByStatus[column.id] || []).map((lead) => (
                  <KanbanCard
                    key={lead.id}
                    lead={lead}
                    onDragStart={() => handleDragStart(lead)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onLeadSelect(lead)}
                    isDragging={draggedLead?.id === lead.id}
                  />
                ))}
              </AnimatePresence>
            </KanbanColumn>
          ))}
        </div>
      </div>
    </div>
  );
};

export default KanbanView;
