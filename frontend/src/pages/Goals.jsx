import React, { useState, useEffect } from 'react';
import { goalsAPI, exportAPI } from '../services/api';
import { FiTarget, FiZap, FiCheckCircle, FiClock, FiDownload, FiArchive, FiPlus } from 'react-icons/fi';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmModal from '../components/common/ConfirmModal';

// Composants
import GoalStats from '../components/goals/GoalStats';
import GoalList from '../components/goals/GoalList';
import GoalForm from '../components/goals/GoalForm';
import GoalFilter from '../components/goals/GoalFilter';
import Button from '../components/common/Button';

const Goals = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [goals, setGoals] = useState([]);
  const [archivedGoals, setArchivedGoals] = useState([]);
  const [filteredGoals, setFilteredGoals] = useState([]);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('active'); // 'active', 'completed', 'upcoming', 'archived'
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    progress: 0,
    upcoming: 0,
    archived: 0
  });
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    period: 'all'
  });
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');

  // Récupération des objectifs depuis l'API
  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    setIsLoading(true);
    try {
      // Récupérer objectifs actifs et archivés en parallèle
      const [goalsData, archivedData] = await Promise.all([
        goalsAPI.getAll(),
        goalsAPI.getArchived().catch(() => [])
      ]);

      // Filtrer les objectifs non archivés
      const activeGoalsData = goalsData.filter(g => !g.is_archived);

      // Pour chaque objectif, récupérer ses jalons
      for (const goal of activeGoalsData) {
        try {
          const milestones = await goalsAPI.getMilestones(goal.id);
          goal.milestones = milestones;
        } catch (err) {
          goal.milestones = [];
        }
      }

      for (const goal of archivedData) {
        try {
          const milestones = await goalsAPI.getMilestones(goal.id);
          goal.milestones = milestones;
        } catch (err) {
          goal.milestones = [];
        }
      }

      setGoals(activeGoalsData);
      setArchivedGoals(archivedData);
      calculateStats(activeGoalsData, archivedData);
    } catch (error) {
      console.error('Erreur lors du chargement des objectifs:', error);
      setGoals([]);
      setArchivedGoals([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Calcul des statistiques
  const calculateStats = (goalData, archivedData = []) => {
    const now = new Date();

    const activeGoals = goalData.filter(goal => {
      const startDate = new Date(goal.start_date);
      const endDate = new Date(goal.end_date);
      return startDate <= now && endDate >= now && goal.current_value < goal.target_value;
    });

    const completedGoals = goalData.filter(goal => {
      return goal.current_value >= goal.target_value || goal.status === 'completed';
    });

    const upcomingGoals = goalData.filter(goal => {
      const startDate = new Date(goal.start_date);
      return startDate > now;
    });

    let totalProgress = 0;
    let totalTargets = 0;

    activeGoals.forEach(goal => {
      totalProgress += goal.current_value;
      totalTargets += goal.target_value;
    });

    const progressPercentage = totalTargets > 0
      ? Math.round((totalProgress / totalTargets) * 100)
      : 0;

    setStats({
      total: goalData.length,
      active: activeGoals.length,
      completed: completedGoals.length,
      progress: progressPercentage,
      upcoming: upcomingGoals.length,
      archived: archivedData.length
    });
  };

  // Filtrage des objectifs
  useEffect(() => {
    let result = view === 'archived' ? archivedGoals : goals;
    const now = new Date();

    // Filtre par vue
    if (view === 'active') {
      result = result.filter(goal => {
        const startDate = new Date(goal.start_date);
        const endDate = new Date(goal.end_date);
        const isCompleted = goal.current_value >= goal.target_value || goal.status === 'completed';
        return startDate <= now && endDate >= now && !isCompleted;
      });
    } else if (view === 'completed') {
      result = result.filter(goal => goal.current_value >= goal.target_value || goal.status === 'completed');
    } else if (view === 'upcoming') {
      result = result.filter(goal => {
        const startDate = new Date(goal.start_date);
        return startDate > now;
      });
    }

    // Filtre par recherche
    if (filters.search) {
      result = result.filter(goal =>
        goal.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        (goal.description && goal.description.toLowerCase().includes(filters.search.toLowerCase()))
      );
    }

    // Filtre par catégorie
    if (filters.category !== 'all') {
      result = result.filter(goal => goal.category === filters.category);
    }

    // Filtre par période
    if (filters.period !== 'all') {
      result = result.filter(goal => goal.period === filters.period);
    }

    // Tri
    result.sort((a, b) => {
      let aValue, bValue;
      switch (sortField) {
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'deadline':
          aValue = new Date(a.end_date);
          bValue = new Date(b.end_date);
          break;
        case 'progress':
          aValue = a.target_value > 0 ? (a.current_value / a.target_value) : 0;
          bValue = b.target_value > 0 ? (b.current_value / b.target_value) : 0;
          break;
        default:
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
      }
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredGoals(result);
  }, [goals, archivedGoals, view, filters, sortField, sortDirection]);

  // Gestion du tri
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Mise à jour rapide de la progression
  const handleQuickUpdateProgress = async (goalId, newValue) => {
    try {
      await goalsAPI.updateProgress(goalId, newValue);

      const updatedGoals = goals.map(goal => {
        if (goal.id === goalId) {
          return { ...goal, current_value: newValue, updated_at: new Date().toISOString() };
        }
        return goal;
      });

      setGoals(updatedGoals);
      calculateStats(updatedGoals, archivedGoals);
      toast.success('Progression mise à jour !');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // Marquer comme terminé
  const handleComplete = async (goalId) => {
    try {
      await goalsAPI.complete(goalId);

      const updatedGoals = goals.map(goal => {
        if (goal.id === goalId) {
          return { ...goal, status: 'completed', updated_at: new Date().toISOString() };
        }
        return goal;
      });

      setGoals(updatedGoals);
      calculateStats(updatedGoals, archivedGoals);
      toast.success('Objectif marqué comme terminé !');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la completion');
    }
  };

  // Archiver
  const handleArchive = async (goalId) => {
    try {
      const archivedGoal = await goalsAPI.archive(goalId);

      // Retirer de la liste active
      const remainingGoals = goals.filter(g => g.id !== goalId);
      setGoals(remainingGoals);

      // Ajouter aux archives
      const goalToArchive = goals.find(g => g.id === goalId);
      if (goalToArchive) {
        setArchivedGoals([{ ...goalToArchive, is_archived: true }, ...archivedGoals]);
      }

      calculateStats(remainingGoals, [...archivedGoals, goalToArchive]);
      toast.success('Objectif archivé !');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'archivage');
    }
  };

  // Désarchiver
  const handleUnarchive = async (goalId) => {
    try {
      await goalsAPI.unarchive(goalId);

      // Retirer des archives
      const goalToRestore = archivedGoals.find(g => g.id === goalId);
      const remainingArchived = archivedGoals.filter(g => g.id !== goalId);
      setArchivedGoals(remainingArchived);

      // Ajouter aux actifs
      if (goalToRestore) {
        const restoredGoal = { ...goalToRestore, is_archived: false, status: 'active' };
        setGoals([restoredGoal, ...goals]);
        calculateStats([restoredGoal, ...goals], remainingArchived);
      }

      toast.success('Objectif restauré !');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la restauration');
    }
  };

  // Dupliquer
  const handleDuplicate = async (goalId) => {
    try {
      // Calculer les nouvelles dates (mois suivant)
      const originalGoal = goals.find(g => g.id === goalId) || archivedGoals.find(g => g.id === goalId);
      if (!originalGoal) return;

      const startDate = new Date(originalGoal.start_date);
      const endDate = new Date(originalGoal.end_date);
      const duration = endDate - startDate;

      const newStartDate = new Date();
      const newEndDate = new Date(newStartDate.getTime() + duration);

      const newGoal = await goalsAPI.duplicate(goalId, {
        start_date: newStartDate.toISOString(),
        end_date: newEndDate.toISOString()
      });

      // Récupérer les milestones
      try {
        const milestones = await goalsAPI.getMilestones(newGoal.id);
        newGoal.milestones = milestones;
      } catch (err) {
        newGoal.milestones = [];
      }

      setGoals([newGoal, ...goals]);
      calculateStats([newGoal, ...goals], archivedGoals);
      toast.success('Objectif dupliqué !');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la duplication');
    }
  };

  // Supprimer
  const handleDelete = async (goalId) => {
    const goalToDelete = goals.find(g => g.id === goalId) || archivedGoals.find(g => g.id === goalId);
    if (!goalToDelete) return;

    const confirmed = await confirm({
      title: 'Supprimer cet objectif ?',
      message: 'Cette action est irréversible.',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger',
      itemName: goalToDelete.name
    });

    if (!confirmed) return;

    try {
      await goalsAPI.delete(goalId);

      if (view === 'archived') {
        const remaining = archivedGoals.filter(g => g.id !== goalId);
        setArchivedGoals(remaining);
        calculateStats(goals, remaining);
      } else {
        const remaining = goals.filter(g => g.id !== goalId);
        setGoals(remaining);
        calculateStats(remaining, archivedGoals);
      }

      toast.success('Objectif supprimé');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Éditer
  const handleEdit = (goal) => {
    setEditingGoal(goal);
    setIsAddingGoal(true);
  };

  // Sauvegarder (création ou modification)
  const handleSaveGoal = async (goalData) => {
    try {
      const apiData = {
        name: goalData.title || goalData.name,
        description: goalData.description || '',
        target_value: goalData.target_value,
        current_value: goalData.current_value || 0,
        category: goalData.category,
        period: goalData.period,
        start_date: goalData.start_date,
        end_date: goalData.end_date
      };

      if (editingGoal) {
        // Mise à jour
        const updatedGoal = await goalsAPI.update(editingGoal.id, apiData);
        updatedGoal.milestones = editingGoal.milestones || [];

        const updatedGoals = goals.map(g =>
          g.id === editingGoal.id ? { ...g, ...updatedGoal } : g
        );
        setGoals(updatedGoals);
        calculateStats(updatedGoals, archivedGoals);
        toast.success('Objectif mis à jour !');
      } else {
        // Création
        const newGoal = await goalsAPI.create(apiData);
        newGoal.milestones = [];

        const updatedGoals = [newGoal, ...goals];
        setGoals(updatedGoals);
        calculateStats(updatedGoals, archivedGoals);
        toast.success('Objectif créé !');
      }

      setIsAddingGoal(false);
      setEditingGoal(null);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Annuler
  const handleCancel = () => {
    setIsAddingGoal(false);
    setEditingGoal(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-2 sm:p-4">
      <div className="max-w-5xl mx-auto w-full">
        {/* En-tête */}
        <header className="mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-300">
                Objectifs
              </h1>
              <p className="text-amber-200/70 mt-1 text-sm">
                {stats.active} en cours · {stats.completed} complétés · {stats.archived} archivés
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => exportAPI.goals()}
                variant="secondary"
                icon={FiDownload}
              >
                Exporter
              </Button>
              <Button
                onClick={() => { setEditingGoal(null); setIsAddingGoal(true); }}
                variant="primary"
                icon={FiPlus}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Objectif
              </Button>
            </div>
          </div>

          {/* Toggle de vue simplifié */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setView('active')}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                view === 'active'
                  ? 'bg-amber-600 text-white'
                  : 'bg-surface/50 text-text-secondary hover:bg-surface-strong/50'
              }`}
            >
              <FiZap /> En cours ({stats.active})
            </button>
            <button
              onClick={() => setView('completed')}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                view === 'completed'
                  ? 'bg-green-600 text-white'
                  : 'bg-surface/50 text-text-secondary hover:bg-surface-strong/50'
              }`}
            >
              <FiCheckCircle /> Complétés ({stats.completed})
            </button>
            <button
              onClick={() => setView('upcoming')}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                view === 'upcoming'
                  ? 'bg-purple-600 text-white'
                  : 'bg-surface/50 text-text-secondary hover:bg-surface-strong/50'
              }`}
            >
              <FiClock /> À venir ({stats.upcoming})
            </button>
            <button
              onClick={() => setView('archived')}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                view === 'archived'
                  ? 'bg-border-strong text-text-primary'
                  : 'bg-surface/50 text-text-secondary hover:bg-surface-strong/50'
              }`}
            >
              <FiArchive /> Archives ({stats.archived})
            </button>
          </div>
        </header>

        {/* Stats (seulement si pas en mode archives) */}
        {view !== 'archived' && <GoalStats stats={stats} />}

        {/* Filtres */}
        <div className="mb-6">
          <GoalFilter
            filters={filters}
            setFilters={setFilters}
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
          />
        </div>

        {/* Formulaire d'ajout/édition */}
        {isAddingGoal && (
          <div className="mb-6 bg-surface/50 rounded-xl p-4 sm:p-6 border border-border/50">
            <h2 className="text-xl font-semibold text-text-primary mb-4">
              {editingGoal ? 'Modifier l\'objectif' : 'Nouvel objectif'}
            </h2>
            <GoalForm
              goal={editingGoal}
              onSave={handleSaveGoal}
              onCancel={handleCancel}
            />
          </div>
        )}

        {/* Liste des objectifs */}
        <GoalList
          goals={filteredGoals}
          onUpdateProgress={view !== 'archived' ? handleQuickUpdateProgress : null}
          onComplete={view !== 'archived' ? handleComplete : null}
          onArchive={view === 'completed' ? handleArchive : null}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onEdit={view !== 'archived' ? handleEdit : null}
        />

        {/* Bouton restaurer pour les archives */}
        {view === 'archived' && filteredGoals.length > 0 && (
          <div className="mt-4 text-center text-sm text-text-muted">
            Cliquez sur un objectif archivé pour voir ses détails.
            {filteredGoals.map(goal => (
              <button
                key={goal.id}
                onClick={() => handleUnarchive(goal.id)}
                className="ml-2 text-amber-400 hover:text-amber-300 underline"
              >
                Restaurer "{goal.name}"
              </button>
            ))}
          </div>
        )}

        {/* Modal de confirmation */}
        <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />
      </div>
    </div>
  );
};

export default Goals;
