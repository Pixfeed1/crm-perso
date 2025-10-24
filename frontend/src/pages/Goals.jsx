import React, { useState, useEffect } from 'react';
import { goalsAPI } from '../services/api';
import { FiTarget, FiZap, FiCheckCircle, FiClock } from 'react-icons/fi';

// Composants
import GoalStats from '../components/goals/GoalStats';
import GoalList from '../components/goals/GoalList';
import GoalDetails from '../components/goals/GoalDetails';
import GoalForm from '../components/goals/GoalForm';
import GoalFilter from '../components/goals/GoalFilter';
import EmptyState from '../components/common/EmptyState';

const Goals = () => {
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
    
    setFilteredGoals(result);
  }, [goals, view, filters]);

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
      alert("Objectif créé avec succès!");
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'objectif:', error);
      alert(`Erreur lors de la création de l'objectif: ${error.message || 'Une erreur est survenue'}`);
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
      alert("Objectif mis à jour avec succès!");
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'objectif:', error);
      alert(`Erreur lors de la mise à jour de l'objectif: ${error.message || 'Une erreur est survenue'}`);
    }
  };

  // Suppression d'un objectif via l'API
  const handleDeleteGoal = async (id) => {
    try {
      // Utiliser l'API pour supprimer l'objectif
      await goalsAPI.delete(id);
      console.log('Objectif supprimé via API');
      
      // Mettre à jour l'état local
      const remainingGoals = goals.filter(goal => goal.id !== id);
      setGoals(remainingGoals);
      calculateStats(remainingGoals);
      setSelectedGoal(null);
      
      alert("Objectif supprimé avec succès");
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'objectif:', error);
      alert(`Erreur lors de la suppression de l'objectif: ${error.message || 'Une erreur est survenue'}`);
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
      alert(`Erreur lors de l'ajout de l'étape: ${error.message || 'Une erreur est survenue'}`);
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
      alert(`Erreur lors de la mise à jour de l'étape: ${error.message || 'Une erreur est survenue'}`);
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
    <div className="h-full flex flex-col">
      <header className="mb-6">
        <h1 
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-300"
        >
          Objectifs
        </h1>
        <p 
          className="text-amber-200 mt-2"
        >
          Définissez vos objectifs et suivez votre progression vers le succès
        </p>
      </header>

      {/* Section statistiques */}
      <GoalStats stats={stats} />
      
      {/* Filtres et contrôles */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-3 py-2 rounded-lg text-sm flex items-center ${
              view === 'all'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
            }`}
            onClick={() => setView('all')}
          >
            <FiTarget className="mr-1" />
            Tous
          </button>
          <button
            className={`px-3 py-2 rounded-lg text-sm flex items-center ${
              view === 'active'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
            }`}
            onClick={() => setView('active')}
          >
            <FiZap className="mr-1" />
            En cours
          </button>
          <button
            className={`px-3 py-2 rounded-lg text-sm flex items-center ${
              view === 'completed'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
            }`}
            onClick={() => setView('completed')}
          >
            <FiCheckCircle className="mr-1" />
            Complétés
          </button>
          <button
            className={`px-3 py-2 rounded-lg text-sm flex items-center ${
              view === 'upcoming'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
            }`}
            onClick={() => setView('upcoming')}
          >
            <FiClock className="mr-1" />
            À venir
          </button>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg flex items-center shadow-md hover:scale-105 active:scale-95 transition-transform"
            onClick={handleAddGoal}
          >
            <span className="mr-2">+</span>
            Objectif
          </button>
        </div>
      </div>
      
      {/* Filtre de recherche */}
      <GoalFilter 
        filters={filters} 
        setFilters={setFilters} 
      />
      
      {/* Contenu principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-grow">
        {/* Liste des objectifs */}
        <div className="md:col-span-2 bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Liste des objectifs</h3>
          <GoalList 
            goals={filteredGoals}
            selectedGoal={selectedGoal}
            onSelectGoal={handleSelectGoal}
          />
        </div>
        
        {/* Panneau de détails ou formulaire */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6">
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
          ) : (
            <div
              key="empty-state"
              className="h-full flex items-center justify-center"
            >
              <EmptyState
                icon={<FiTarget />}
                title="Objectifs"
                description="Sélectionnez un objectif dans la liste ou créez-en un nouveau."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Goals;