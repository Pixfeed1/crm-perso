// src/components/goals/GoalList.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiUsers, FiDollarSign, FiSettings, FiRadio, FiStar,
  FiCheckCircle, FiClock, FiZap, FiAlertCircle, FiMinusCircle,
  FiTarget, FiMapPin, FiPlus, FiEdit2, FiArchive, FiCopy,
  FiChevronDown, FiChevronUp, FiTrash2, FiTrendingUp, FiTool,
  FiRefreshCw, FiUserPlus, FiFileText, FiBriefcase, FiSend
} from 'react-icons/fi';
import { computePace, PACE_META, isAutoGoalCategory } from '../../utils/goalPace';

const GoalList = ({
  goals,
  selectedGoal,
  onSelectGoal,
  onUpdateProgress,
  onComplete,
  onArchive,
  onDuplicate,
  onDelete,
  onEdit
}) => {
  const [expandedGoalId, setExpandedGoalId] = useState(null);

  // Fonction pour calculer le pourcentage de progression
  const calculateProgress = (current, target) => {
    return Math.min(100, Math.round((current / target) * 100));
  };

  // Formatage des dates
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short'
    });
  };

  // Configuration des couleurs de catégorie
  const categoryConfig = {
    // Catégories métier (auto) — tokens sémantiques
    'maintenance_signed': { icon: <FiTool />, label: 'Maintenance', color: 'text-info-text', unit: '' },
    'subscriptions': { icon: <FiRefreshCw />, label: 'Abonnements', color: 'text-info-text', unit: '' },
    'new_clients': { icon: <FiUserPlus />, label: 'Nouveaux clients', color: 'text-info-text', unit: '' },
    'quotes_sent': { icon: <FiFileText />, label: 'Devis envoyés', color: 'text-info-text', unit: '' },
    'projects_signed': { icon: <FiBriefcase />, label: 'Projets', color: 'text-info-text', unit: '' },
    'revenue_cashed': { icon: <FiDollarSign />, label: 'CA encaissé', color: 'text-success-text', unit: ' €' },
    'prospects_contacted': { icon: <FiSend />, label: 'Prospects contactés', color: 'text-info-text', unit: '' },
    // Catégories manuelles (style existant conservé)
    'leads': { icon: <FiUsers />, label: 'Leads', color: 'text-blue-300', unit: '' },
    'revenue': { icon: <FiDollarSign />, label: 'Revenus', color: 'text-emerald-300', unit: ' €' },
    'productivity': { icon: <FiSettings />, label: 'Productivité', color: 'text-purple-300', unit: '' },
    'marketing': { icon: <FiRadio />, label: 'Marketing', color: 'text-amber-300', unit: '' },
    'personal': { icon: <FiStar />, label: 'Personnel', color: 'text-rose-300', unit: '' }
  };

  // Boutons d'incrémentation rapide par catégorie
  const quickIncrements = {
    'leads': [1, 5, 10],
    'revenue': [500, 1000, 5000],
    'productivity': [1, 5, 10],
    'marketing': [100, 500, 1000],
    'personal': [1, 5, 10]
  };

  // Vérifier si un objectif est actif (en cours)
  const isActive = (goal) => {
    const now = new Date();
    const startDate = new Date(goal.start_date);
    const endDate = new Date(goal.end_date);
    return startDate <= now && endDate >= now;
  };

  // Vérifier si un objectif est à venir
  const isUpcoming = (goal) => {
    const now = new Date();
    const startDate = new Date(goal.start_date);
    return startDate > now;
  };

  // Vérifier si un objectif est complété
  const isCompleted = (goal) => {
    return goal.current_value >= goal.target_value || goal.status === 'completed';
  };

  // Vérifier si un objectif est expiré
  const isExpired = (goal) => {
    const now = new Date();
    const endDate = new Date(goal.end_date);
    return endDate < now && !isCompleted(goal);
  };

  // Obtenir le statut de l'objectif
  const getGoalStatus = (goal) => {
    if (isCompleted(goal)) {
      return { text: 'Complété', color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: <FiCheckCircle /> };
    } else if (isUpcoming(goal)) {
      return { text: 'À venir', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icon: <FiClock /> };
    } else if (isActive(goal)) {
      return { text: 'En cours', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: <FiZap /> };
    } else if (isExpired(goal)) {
      return { text: 'Expiré', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30', icon: <FiAlertCircle /> };
    } else {
      return { text: 'Inactif', color: 'bg-gray-500/20 text-text-secondary border-gray-500/30', icon: <FiMinusCircle /> };
    }
  };

  // Calculer le temps restant
  const getTimeRemaining = (goal) => {
    if (!isActive(goal)) return null;

    const now = new Date();
    const endDate = new Date(goal.end_date);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Aujourd\'hui';
    if (diffDays === 1) return '1 jour';
    return `${diffDays} jours`;
  };

  // Formater la valeur avec unité
  const formatValue = (value, category) => {
    const config = categoryConfig[category] || { unit: '' };
    // Catégories monétaires : séparateurs de milliers (€)
    if (config.unit && config.unit.includes('€')) {
      return new Intl.NumberFormat('fr-FR').format(Math.round(value)) + config.unit;
    }
    return value + config.unit;
  };

  // Trier les objectifs
  const sortedGoals = [...goals].sort((a, b) => {
    const statusA = isActive(a) ? 0 : isUpcoming(a) ? 1 : isExpired(a) ? 2 : 3;
    const statusB = isActive(b) ? 0 : isUpcoming(b) ? 1 : isExpired(b) ? 2 : 3;

    if (statusA !== statusB) return statusA - statusB;
    return new Date(a.end_date) - new Date(b.end_date);
  });

  if (goals.length === 0) {
    return (
      <div className="bg-surface/30 rounded-xl p-8 text-center">
        <FiTarget className="mx-auto text-5xl text-text-muted mb-4" />
        <h4 className="text-lg font-medium text-text-primary mb-2">Aucun objectif</h4>
        <p className="text-text-muted text-sm">
          Créez votre premier objectif pour commencer à suivre votre progression.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedGoals.map(goal => {
        const progress = calculateProgress(goal.current_value, goal.target_value);
        const statusInfo = getGoalStatus(goal);
        const timeRemaining = getTimeRemaining(goal);
        const categoryInfo = categoryConfig[goal.category] || { icon: <FiMapPin />, label: goal.category, color: 'text-text-secondary', unit: '' };
        const isExpanded = expandedGoalId === goal.id;
        const completed = isCompleted(goal);
        const increments = quickIncrements[goal.category] || [1, 5, 10];
        const auto = goal.auto || isAutoGoalCategory(goal.category);
        const active = isActive(goal);
        const pace = computePace(goal);
        const paceMeta = PACE_META[pace.status] || PACE_META.on_time;

        return (
          <motion.div
            key={goal.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl border overflow-hidden transition-all ${
              completed
                ? 'bg-green-900/10 border-green-500/20'
                : 'bg-surface/50 border-border/50 hover:border-border-strong/50'
            }`}
          >
            {/* Header de la carte */}
            <div className="p-4">
              {/* Ligne 1: Statut + Catégorie + Période */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                    {statusInfo.icon}
                    {statusInfo.text}
                  </span>

                  <span className={`flex items-center gap-1 ${categoryInfo.color} text-xs px-2 py-1 bg-surface/70 rounded-md`}>
                    {categoryInfo.icon}
                    {categoryInfo.label}
                  </span>

                  {auto && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-info-bg text-info-text font-medium" title="Réalisé calculé automatiquement depuis les données">
                      <FiZap size={11} /> Auto
                    </span>
                  )}

                  {timeRemaining && (
                    <span className="text-xs text-text-muted px-2 py-1 bg-surface/50 rounded-md">
                      {timeRemaining} restants
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedGoalId(isExpanded ? null : goal.id); }}
                    className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-strong/50 rounded-lg transition-colors"
                    title={isExpanded ? 'Réduire' : 'Développer'}
                  >
                    {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                  </button>
                </div>
              </div>

              {/* Ligne 2: Nom + Valeurs */}
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-text-primary text-lg leading-tight">{goal.name}</h3>
                <div className="text-right ml-4 shrink-0">
                  <div className="text-xl font-bold text-text-primary">
                    {formatValue(goal.current_value, goal.category)}
                  </div>
                  <div className="text-sm text-text-muted">
                    sur {formatValue(goal.target_value, goal.category)}
                  </div>
                </div>
              </div>

              {/* Barre de progression */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-muted">{formatDate(goal.start_date)} → {formatDate(goal.end_date)}</span>
                  <span className={`font-bold ${progress >= 100 ? 'text-green-400' : progress >= 75 ? 'text-amber-400' : 'text-text-primary'}`}>
                    {progress}%
                  </span>
                </div>
                <div className="h-3 bg-surface-strong/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`h-full rounded-full ${
                      progress >= 100
                        ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                        : progress >= 75
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                          : progress >= 50
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                            : 'bg-gradient-to-r from-purple-500 to-pink-400'
                    }`}
                  />
                </div>
              </div>

              {/* Rythme : avance/retard vs temps écoulé + reste à faire + cadence nécessaire */}
              {active && !completed && (
                <div className="mb-3 flex items-center gap-2 flex-wrap text-xs">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${paceMeta.cls}`}>
                    <FiTrendingUp size={12} /> {paceMeta.label}
                  </span>
                  {pace.remaining > 0 && (
                    <span className="text-text-muted">
                      Reste {formatValue(Math.round(pace.remaining), goal.category)}
                      {pace.daysLeft > 0 && (
                        <> · ~{formatValue(Math.ceil(pace.ratePerUnit), goal.category)}/{pace.rateUnit}</>
                      )}
                    </span>
                  )}
                  <span className="text-text-muted">
                    ({Math.round(pace.timePct * 100)}% du temps écoulé)
                  </span>
                </div>
              )}

              {/* Actions rapides */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Boutons d'incrémentation (catégories manuelles uniquement) */}
                {!completed && !auto && onUpdateProgress && (
                  <div className="flex items-center gap-1">
                    {increments.map((inc) => (
                      <button
                        key={inc}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateProgress(goal.id, goal.current_value + inc);
                        }}
                        className="px-2 py-1 text-xs bg-accent/30 hover:bg-accent/50 text-indigo-300 rounded-md transition-colors flex items-center gap-1"
                        title={`Ajouter ${formatValue(inc, goal.category)}`}
                      >
                        <FiPlus className="w-3 h-3" />
                        {goal.category === 'revenue' ? `${inc}€` : inc}
                      </button>
                    ))}
                  </div>
                )}

                {/* Actions de l'objectif */}
                <div className="flex items-center gap-1 ml-auto">
                  {onEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(goal); }}
                      className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-strong/50 rounded-lg transition-colors"
                      title="Modifier"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                  )}

                  {completed && onArchive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchive(goal.id); }}
                      className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-900/30 rounded-lg transition-colors"
                      title="Archiver"
                    >
                      <FiArchive className="w-4 h-4" />
                    </button>
                  )}

                  {!completed && onComplete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onComplete(goal.id); }}
                      className="p-1.5 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded-lg transition-colors"
                      title="Marquer comme terminé"
                    >
                      <FiCheckCircle className="w-4 h-4" />
                    </button>
                  )}

                  {onDuplicate && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicate(goal.id); }}
                      className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-lg transition-colors"
                      title="Dupliquer"
                    >
                      <FiCopy className="w-4 h-4" />
                    </button>
                  )}

                  {onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(goal.id); }}
                      className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Section étendue avec milestones */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-border/50"
                >
                  <div className="p-4 bg-surface-muted/30">
                    {/* Description */}
                    {goal.description && (
                      <div className="mb-4">
                        <h4 className="text-xs font-medium text-text-muted uppercase mb-1">Description</h4>
                        <p className="text-sm text-text-secondary">{goal.description}</p>
                      </div>
                    )}

                    {/* Milestones */}
                    {goal.milestones && goal.milestones.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-text-muted uppercase mb-2">
                          Étapes ({goal.milestones.filter(m => m.achieved).length}/{goal.milestones.length})
                        </h4>
                        <div className="space-y-2">
                          {goal.milestones.map((milestone) => (
                            <div
                              key={milestone.id}
                              className={`flex items-center justify-between p-2 rounded-lg ${
                                milestone.achieved
                                  ? 'bg-green-900/20 border border-green-500/20'
                                  : 'bg-surface/50 border border-border/30'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {milestone.achieved ? (
                                  <FiCheckCircle className="text-green-400" />
                                ) : (
                                  <div className="w-4 h-4 rounded-full border-2 border-gray-500" />
                                )}
                                <span className={milestone.achieved ? 'text-green-300' : 'text-text-secondary'}>
                                  {milestone.name}
                                </span>
                              </div>
                              <span className={`text-sm ${milestone.achieved ? 'text-green-400' : 'text-text-muted'}`}>
                                {formatValue(milestone.target, goal.category)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!goal.description && (!goal.milestones || goal.milestones.length === 0) && (
                      <p className="text-sm text-text-muted text-center py-2">
                        Aucun détail supplémentaire
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
};

export default GoalList;
