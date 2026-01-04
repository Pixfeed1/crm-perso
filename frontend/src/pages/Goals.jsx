import React, { useState, useEffect } from 'react';
import { goalsAPI, exportAPI } from '../services/api';
import { FiTarget, FiZap, FiCheckCircle, FiClock, FiDownload } from 'react-icons/fi';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmModal from '../components/common/ConfirmModal';

// Composants
import GoalStats from '../components/goals/GoalStats';
import GoalList from '../components/goals/GoalList';
import GoalDetails from '../components/goals/GoalDetails';
import GoalForm from '../components/goals/GoalForm';
import GoalFilter from '../components/goals/GoalFilter';
import EmptyState from '../components/common/EmptyState';
import Button from '../components/common/Button';

const Goals = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [goals, setGoals] = useState([]);
  const [filteredGoals, setFilteredGoals] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('all'); // 'all', 'active', 'completed', 'upcoming'
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    progress: 0,
    upcoming: 0
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
      const goalsData = await goalsAPI.getAll();
      console.log('Objectifs chargés via API:', goalsData);
      
      // Pour chaque objectif, récupérer ses jalons (milestones)
      for (const goal of goalsData) {
        try {
          const milestones = await goalsAPI.getMilestones(goal.id);
          goal.milestones = milestones;
        } catch (err) {
          console.error(`Erreur lors du chargement des jalons pour l'objectif ${goal.id}:`, err);
          goal.milestones = [];
        }
      }
      
      setGoals(goalsData);
      calculateStats(goalsData);
    } catch (error) {
      console.error('Erreur lors du chargement des objectifs:', error);
      setGoals([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Calcul des statistiques
  const calculateStats = (goalData) => {
    const now = new Date();
    
    // Tri des objectifs par statut
    const activeGoals = goalData.filter(goal => {
      const startDate = new Date(goal.start_date);
      const endDate = new Date(goal.end_date);
      return startDate <= now && endDate >= now;
    });
    
    const completedGoals = goalData.filter(goal => {
      return goal.current_value >= goal.target_value;
    });
    
    const upcomingGoals = goalData.filter(goal => {
      const startDate = new Date(goal.start_date);
      return startDate > now;
    });
    
    // Calcul du progrès global
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
      upcoming: upcomingGoals.length
    });
  };

  // Filtrage des objectifs
  useEffect(() => {
    let result = goals;
    
    // Filtre par vue
    if (view === 'active') {
      const now = new Date();
      result = result.filter(goal => {
        const startDate = new Date(goal.start_date);
        const endDate = new Date(goal.end_date);
        return startDate <= now && endDate >= now;
      });
    } else if (view === 'completed') {
      result = result.filter(goal => goal.current_value >= goal.target_value);
    } else if (view === 'upcoming') {
      const now = new Date();
      result = result.filter(goal => {
        const startDate = new Date(goal.start_date);
        return startDate > now;
      });
    }
    
    // Filtre par recherche
    if (filters.search) {
      result = result.filter(goal => 
        goal.title?.toLowerCase().includes(filters.search.toLowerCase()) ||
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

    // Tri des résultats
    result.sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case 'name':
          aValue = (a.title || a.name || '').toLowerCase();
          bValue = (b.title || b.name || '').toLowerCase();
          break;
        case 'deadline':
          aValue = a.end_date ? new Date(a.end_date) : new Date(0);
          bValue = b.end_date ? new Date(b.end_date) : new Date(0);
          break;
        case 'progress':
          aValue = a.target_value > 0 ? (a.current_value / a.target_value) : 0;
          bValue = b.target_value > 0 ? (b.current_value / b.target_value) : 0;
          break;
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredGoals(result);
  }, [goals, view, filters, sortField, sortDirection]);

  // Gestion du tri
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sélection d'un objectif
  const handleSelectGoal = (goal) => {
    setSelectedGoal(goal);
    setIsAddingGoal(false);
  };

  // Ajout d'un nouvel objectif
  const handleAddGoal = () => {
    setSelectedGoal(null);
    setIsAddingGoal(true);
  };

  // Sauvegarde d'un nouvel objectif via l'API
  const handleSaveGoal = async (goalData) => {
    try {
      // Créer le format de données attendu par l'API
      const apiData = {
        name: goalData.title, // Utiliser "name" au lieu de "nom"
        description: goalData.description || '',
        target_value: goalData.target_value,
        current_value: goalData.current_value || 0,
        category: goalData.category, // Utiliser "category" au lieu de "categorie"
        period: goalData.period, // Utiliser "period" au lieu de "periode"
        start_date: goalData.start_date,
        end_date: goalData.end_date
      };

      // Log des données pour debugging
      console.log("Données préparées pour l'API:", JSON.stringify(apiData, null, 2));
      
      // Envoyer à l'API
      const newGoal = await goalsAPI.create(apiData);
      console.log('Objectif créé via API:', newGoal);
      
      // Ajouter les milestones vides par défaut
      newGoal.milestones = [];
      
      // Harmoniser les noms de champs pour l'affichage frontend
      if (newGoal.name && !newGoal.title) newGoal.title = newGoal.name;
      
      // Mettre à jour l'état local
      const updatedGoals = [...goals, newGoal];
      setGoals(updatedGoals);
      calculateStats(updatedGoals);
      setIsAddingGoal(false);
      setSelectedGoal(newGoal);

      // Notification de succès
      toast.success("Objectif créé avec succès!");
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'objectif:', error);
      toast.error(`Erreur lors de la création de l'objectif: ${error.message || 'Une erreur est survenue'}`);
    }
  };

  // Mise à jour d'un objectif existant via l'API
  const handleUpdateGoal = async (id, updatedData) => {
    try {
      // Vérifier s'il s'agit d'une mise à jour de progression uniquement
      if (Object.keys(updatedData).length === 1 && 'current_value' in updatedData) {
        console.log(`Mise à jour de la progression de l'objectif ID ${id} à ${updatedData.current_value}`);
        
        // Envoyer uniquement la valeur current_value à l'API
        const updatedGoal = await goalsAPI.update(id, { current_value: updatedData.current_value });
        console.log('Progression de l\'objectif mise à jour via API:', updatedGoal);
        
        // Mettre à jour l'état local
        const updatedGoals = goals.map(goal => {
          if (goal.id === id) {
            return {
              ...goal,
              current_value: updatedData.current_value,
              updated_at: new Date().toISOString()
            };
          }
          return goal;
        });
        
        setGoals(updatedGoals);
        calculateStats(updatedGoals);
        setSelectedGoal(updatedGoals.find(goal => goal.id === id));
        
        return; // Sortir de la fonction après la mise à jour de la progression
      }
      
      // Pour les autres mises à jour complètes
      // Créer le format de données attendu par l'API
      const apiData = {};
      
      // Ne prendre que les champs définis et non vides
      if (updatedData.title || updatedData.name) apiData.name = updatedData.title || updatedData.name;
      if (updatedData.description !== undefined) apiData.description = updatedData.description;
      if (updatedData.target_value !== undefined) apiData.target_value = updatedData.target_value;
      if (updatedData.current_value !== undefined) apiData.current_value = updatedData.current_value;
      if (updatedData.category) apiData.category = updatedData.category;
      if (updatedData.period) apiData.period = updatedData.period;
      if (updatedData.start_date) apiData.start_date = updatedData.start_date;
      if (updatedData.end_date) apiData.end_date = updatedData.end_date;
      
      // Log pour debugging
      console.log(`Données pour la mise à jour de l'objectif ID ${id}:`, JSON.stringify(apiData, null, 2));
      
      // Vérifier qu'il y a des données à mettre à jour
      if (Object.keys(apiData).length === 0) {
        throw new Error("Aucune donnée valide à mettre à jour");
      }
      
      // Envoyer à l'API
      const updatedGoal = await goalsAPI.update(id, apiData);
      console.log('Objectif mis à jour via API:', updatedGoal);
      
      // Harmoniser les noms de champs pour l'affichage frontend
      if (updatedGoal.name && !updatedGoal.title) updatedGoal.title = updatedGoal.name;
      
      // Mettre à jour l'état local
      const updatedGoals = goals.map(goal => {
        if (goal.id === id) {
          return {
            ...goal,
            ...updatedGoal,
            milestones: updatedGoal.milestones || goal.milestones
          };
        }
        return goal;
      });
      
      setGoals(updatedGoals);
      calculateStats(updatedGoals);
      setSelectedGoal(updatedGoals.find(goal => goal.id === id));

      // Notification de succès
      toast.success("Objectif mis à jour avec succès!");
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'objectif:', error);
      toast.error(`Erreur lors de la mise à jour de l'objectif: ${error.message || 'Une erreur est survenue'}`);
    }
  };

  // Suppression d'un objectif via l'API
  const handleDeleteGoal = async (id) => {
    try {
      // Trouver l'objectif à supprimer
      const goalToDelete = goals.find(goal => goal.id === id);
      if (!goalToDelete) return;

      // Demander confirmation
      const confirmed = await confirm({
        title: "Supprimer cet objectif ?",
        message: "Cette action est irréversible. Toutes les étapes associées seront également supprimées.",
        confirmText: "Supprimer",
        cancelText: "Annuler",
        variant: "danger",
        itemName: goalToDelete.title || goalToDelete.name
      });

      if (!confirmed) return;

      // Utiliser l'API pour supprimer l'objectif
      await goalsAPI.delete(id);
      console.log('Objectif supprimé via API');

      // Mettre à jour l'état local
      const remainingGoals = goals.filter(goal => goal.id !== id);
      setGoals(remainingGoals);
      calculateStats(remainingGoals);
      setSelectedGoal(null);

      toast.success("Objectif supprimé avec succès");
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'objectif:', error);
      toast.error(`Erreur lors de la suppression de l'objectif: ${error.message || 'Une erreur est survenue'}`);
    }
  };

  // Ajout d'une étape (milestone) à un objectif via l'API
  const handleAddMilestone = async (goalId, milestoneData) => {
    try {
      // Utiliser l'API pour ajouter un jalon
      const newMilestone = await goalsAPI.addMilestone(goalId, milestoneData);
      console.log('Jalon ajouté via API:', newMilestone);
      
      // Mettre à jour l'état local
      const updatedGoals = goals.map(goal => {
        if (goal.id === goalId) {
          return {
            ...goal,
            milestones: [...goal.milestones, newMilestone]
          };
        }
        return goal;
      });
      
      setGoals(updatedGoals);
      setSelectedGoal(updatedGoals.find(goal => goal.id === goalId));
    } catch (error) {
      console.error('Erreur lors de l\'ajout de l\'étape:', error);
      toast.error(`Erreur lors de l'ajout de l'étape: ${error.message || 'Une erreur est survenue'}`);
    }
  };

  // Mise à jour d'une étape via l'API
  const handleUpdateMilestone = async (goalId, milestoneId, achieved) => {
    try {
      // Utiliser l'API pour mettre à jour un jalon
      const updatedMilestone = await goalsAPI.updateMilestone(goalId, milestoneId, { achieved });
      console.log('Jalon mis à jour via API:', updatedMilestone);
      
      // Mettre à jour l'état local
      const updatedGoals = goals.map(goal => {
        if (goal.id === goalId) {
          const updatedMilestones = goal.milestones.map(milestone => {
            if (milestone.id === milestoneId) {
              return { ...milestone, achieved };
            }
            return milestone;
          });
          
          return {
            ...goal,
            milestones: updatedMilestones
          };
        }
        return goal;
      });
      
      setGoals(updatedGoals);
      setSelectedGoal(updatedGoals.find(goal => goal.id === goalId));
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'étape:', error);
      toast.error(`Erreur lors de la mise à jour de l'étape: ${error.message || 'Une erreur est survenue'}`);
    }
  };

  // Gestion de l'annulation du formulaire
  const handleCancelGoalForm = () => {
    console.log("Annulation du formulaire d'objectif");
    setIsAddingGoal(false);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div
          className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
      <div className="max-w-7xl mx-auto w-full">
        {/* En-tête */}
        <header className="mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-300">
                Objectifs
              </h1>
              <p className="text-amber-200 mt-2 text-sm sm:text-base">
                Définissez vos objectifs et suivez votre progression vers le succès
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {/* Toggle de vue */}
              <div className="bg-gray-800/50 rounded-lg p-1 flex">
                <button
                  className={`px-3 py-1 rounded-lg text-sm flex items-center justify-center flex-1 sm:flex-none ${
                    view === 'all'
                      ? 'bg-amber-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                  onClick={() => setView('all')}
                >
                  <FiTarget className="mr-1" />
                  Tous
                </button>
                <button
                  className={`px-3 py-1 rounded-lg text-sm flex items-center justify-center flex-1 sm:flex-none ${
                    view === 'active'
                      ? 'bg-amber-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                  onClick={() => setView('active')}
                >
                  <FiZap className="mr-1" />
                  En cours
                </button>
                <button
                  className={`px-3 py-1 rounded-lg text-sm flex items-center justify-center flex-1 sm:flex-none ${
                    view === 'completed'
                      ? 'bg-amber-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                  onClick={() => setView('completed')}
                >
                  <FiCheckCircle className="mr-1" />
                  Complétés
                </button>
                <button
                  className={`px-3 py-1 rounded-lg text-sm flex items-center justify-center flex-1 sm:flex-none ${
                    view === 'upcoming'
                      ? 'bg-amber-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                  onClick={() => setView('upcoming')}
                >
                  <FiClock className="mr-1" />
                  À venir
                </button>
              </div>
              {/* Boutons actions */}
              <Button
                onClick={() => exportAPI.goals()}
                variant="secondary"
                icon={FiDownload}
                className="w-full sm:w-auto"
              >
                Exporter
              </Button>
              <Button
                onClick={handleAddGoal}
                variant="primary"
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
              >
                + Objectif
              </Button>
            </div>
          </div>
        </header>

        {/* Section statistiques */}
        <GoalStats stats={stats} />

        {/* Filtre de recherche */}
        <div className="mb-6">
          <GoalFilter
            filters={filters}
            setFilters={setFilters}
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
          />
        </div>

        {/* Liste des objectifs */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 sm:mb-4">Liste des objectifs</h3>
          <GoalList
            goals={filteredGoals}
            selectedGoal={selectedGoal}
            onSelectGoal={handleSelectGoal}
          />
        </div>

        {/* Panneau de détails ou formulaire (sous la liste) */}
        {(isAddingGoal || selectedGoal) && (
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6">
            {isAddingGoal ? (
              <div key="add-form">
                <GoalForm
                  onSave={handleSaveGoal}
                  onCancel={handleCancelGoalForm}
                />
              </div>
            ) : selectedGoal ? (
              <div key={`goal-${selectedGoal.id}`}>
                <GoalDetails
                  goal={selectedGoal}
                  onUpdate={(updatedData) => handleUpdateGoal(selectedGoal.id, updatedData)}
                  onDelete={() => handleDeleteGoal(selectedGoal.id)}
                  onAddMilestone={(milestoneData) => handleAddMilestone(selectedGoal.id, milestoneData)}
                  onUpdateMilestone={(milestoneId, achieved) =>
                    handleUpdateMilestone(selectedGoal.id, milestoneId, achieved)
                  }
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Modal de confirmation */}
        <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />
      </div>
    </div>
  );
};

export default Goals;