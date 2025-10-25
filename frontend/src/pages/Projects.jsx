// src/pages/Projects.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { projectsAPI, exportAPI } from '../services/api';
import { FiAlertTriangle, FiZap, FiTarget, FiArrowLeft, FiDownload, FiList, FiCalendar } from 'react-icons/fi';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import ConfirmModal from '../components/common/ConfirmModal';

// Composants
import ProjectCard from '../components/projects/ProjectCard';
import ProjectDetails from '../components/projects/ProjectDetails';
import ProjectForm from '../components/projects/ProjectForm';
import ProjectFilter from '../components/projects/ProjectFilter';
import TimelineView from '../components/projects/TimelineView';
import EmptyState from '../components/common/EmptyState';

const Projects = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false); // Pour toggle mobile
  const [view, setView] = useState('list'); // 'list' or 'timeline'
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    type: 'all',
    timeframe: 'all'
  });
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    totalBudget: 0
  });

  // Récupération des projets depuis l'API
  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Récupérer les projets via l'API
        const projectsData = await projectsAPI.getAll();
        console.log('Projets chargés via API:', projectsData);

        // Assurer que chaque projet a une valeur de progression
        const projectsWithProgress = projectsData.map(project => ({
          ...project,
          progress: project.progress !== undefined ? project.progress : 0
        }));

        setProjects(projectsWithProgress);
        setFilteredProjects(projectsWithProgress);
        calculateStats(projectsWithProgress);
      } catch (error) {
        console.error('Erreur lors du chargement des projets:', error);
        setError('Impossible de charger les projets. Veuillez réessayer ultérieurement.');
        setProjects([]);
        setFilteredProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // Calcul des statistiques
  const calculateStats = (projectsData) => {
    const total = projectsData.length;

    // Projets actifs (en-cours ou planifié)
    const active = projectsData.filter(p =>
      p.status === 'en-cours' || p.status === 'planifié'
    ).length;

    // Projets terminés
    const completed = projectsData.filter(p => p.status === 'terminé').length;

    // Budget total (somme des budgets de tous les projets)
    const totalBudget = projectsData.reduce((sum, p) => {
      const budget = parseFloat(p.budget) || 0;
      return sum + budget;
    }, 0);

    setStats({
      total,
      active,
      completed,
      totalBudget: Math.round(totalBudget)
    });
  };

  // Filtrage et tri des projets
  useEffect(() => {
    let result = projects.filter(project => {
      // Filtre par recherche
      const searchMatch = filters.search === '' ||
        project.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        (project.lead_name && project.lead_name.toLowerCase().includes(filters.search.toLowerCase()));

      // Filtre par statut
      const statusMatch = filters.status === 'all' || project.status === filters.status;

      // Filtre par type
      const typeMatch = filters.type === 'all' || project.type === filters.type;

      // Filtre par période
      let timeframeMatch = true;
      const now = new Date();
      const startDate = new Date(project.start_date);
      const endDate = new Date(project.end_date);

      if (filters.timeframe === 'current') {
        timeframeMatch = startDate <= now && endDate >= now;
      } else if (filters.timeframe === 'upcoming') {
        timeframeMatch = startDate > now;
      } else if (filters.timeframe === 'past') {
        timeframeMatch = endDate < now;
      }

      return searchMatch && statusMatch && typeMatch && timeframeMatch;
    });

    // Tri des résultats
    result.sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        case 'end_date':
          aValue = a.end_date ? new Date(a.end_date) : new Date(0);
          bValue = b.end_date ? new Date(b.end_date) : new Date(0);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredProjects(result);
  }, [projects, filters, sortField, sortDirection]);

  // Gestion du tri
  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle entre asc et desc si c'est déjà le champ actif
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Nouveau champ de tri: définir à 'asc' par défaut
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sélection d'un projet
  const handleSelectProject = async (project) => {
    setIsLoading(true);
    try {
      // Récupérer les détails complets du projet via l'API
      const projectDetails = await projectsAPI.getById(project.id);
      console.log('Détails du projet chargés via API:', projectDetails);

      // S'assurer que le projet a une propriété progress
      if (projectDetails.progress === undefined) {
        projectDetails.progress = 0;
      }

      setSelectedProject(projectDetails);
      setIsAddingProject(false);
      setShowDetails(true); // Afficher les détails sur mobile
    } catch (error) {
      console.error(`Erreur lors du chargement des détails du projet ${project.id}:`, error);
      // Utiliser les informations de base du projet si les détails ne peuvent pas être chargés
      setSelectedProject({
        ...project,
        progress: project.progress || 0,
        tasks: []
      });
      setIsAddingProject(false);
      setShowDetails(true); // Afficher les détails sur mobile
    } finally {
      setIsLoading(false);
    }
  };

  // Ajout d'un nouveau projet
  const handleAddProject = () => {
    setSelectedProject(null);
    setIsAddingProject(true);
    setShowDetails(true); // Afficher le formulaire sur mobile
  };

  // Retour à la liste (mobile)
  const handleBackToList = () => {
    setShowDetails(false);
    setSelectedProject(null);
    setIsAddingProject(false);
  };

  // Sauvegarde d'un nouveau projet via l'API
  const handleSaveProject = async (projectData) => {
    try {
      // Ajouter une valeur initiale pour la progression
      const projectWithProgress = {
        ...projectData,
        progress: 0 // Valeur initiale de progression
      };

      console.log('Données envoyées pour la création du projet:', projectWithProgress);

      // Utiliser l'API pour créer le projet
      const newProject = await projectsAPI.create(projectWithProgress);
      console.log('Projet créé via API:', newProject);

      // Vérifier que nous avons bien reçu un projet valide
      if (!newProject || !newProject.id) {
        throw new Error('Réponse de création de projet invalide');
      }

      // S'assurer que tous les champs nécessaires sont présents
      const completeProject = {
        ...newProject,
        progress: newProject.progress !== undefined ? newProject.progress : 0,
        tasks: newProject.tasks || []
      };

      // Mettre à jour l'état local
      setProjects([...projects, completeProject]);
      setIsAddingProject(false);
      setSelectedProject(completeProject);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du projet:', error);
      toast.error("Une erreur est survenue lors de la création du projet: " + (error.message || 'Erreur inconnue'));
    }
  };

  // Mise à jour d'un projet existant via l'API
  const handleUpdateProject = async (id, updatedData) => {
    try {
      console.log(`Mise à jour du projet ${id} avec données:`, updatedData);

      // Utiliser l'API pour mettre à jour le projet
      const updatedProject = await projectsAPI.update(id, updatedData);
      console.log('Projet mis à jour via API:', updatedProject);

      // S'assurer que le projet a une propriété progress
      if (updatedProject.progress === undefined) {
        updatedProject.progress = selectedProject?.progress || 0;
      }

      // Mettre à jour l'état local
      const updatedProjects = projects.map(project =>
        project.id === id ? { ...project, ...updatedProject } : project
      );

      setProjects(updatedProjects);

      // Mettre à jour le projet sélectionné
      if (selectedProject && selectedProject.id === id) {
        setSelectedProject({
          ...selectedProject,
          ...updatedProject,
          // Conserver les tâches si elles ne sont pas incluses dans la réponse
          tasks: updatedProject.tasks || selectedProject.tasks || []
        });
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du projet:', error);
      toast.error("Une erreur est survenue lors de la mise à jour du projet: " + (error.message || 'Erreur inconnue'));
    }
  };

  // Suppression d'un projet via l'API
  const handleDeleteProject = async (id) => {
    try {
      // Trouver le projet à supprimer
      const projectToDelete = projects.find(project => project.id === id);
      if (!projectToDelete) return;

      // Demander confirmation
      const confirmed = await confirm({
        title: "Supprimer ce projet ?",
        message: "Cette action est irréversible. Toutes les tâches associées seront également supprimées.",
        confirmText: "Supprimer",
        cancelText: "Annuler",
        variant: "danger",
        itemName: projectToDelete.name
      });

      if (!confirmed) return;

      console.log(`Suppression du projet ${id}`);

      // Utiliser l'API pour supprimer le projet
      await projectsAPI.delete(id);
      console.log('Projet supprimé via API');

      // Mettre à jour l'état local
      const remainingProjects = projects.filter(project => project.id !== id);

      setProjects(remainingProjects);
      setSelectedProject(null);
      setShowDetails(false); // Retour à la liste sur mobile

      toast.success("Projet supprimé avec succès");
    } catch (error) {
      console.error('Erreur lors de la suppression du projet:', error);
      toast.error("Une erreur est survenue lors de la suppression du projet: " + (error.message || 'Erreur inconnue'));
    }
  };

  // Ajout d'une tâche à un projet via l'API
  const handleAddTask = async (projectId, taskData) => {
    try {
      console.log(`Ajout d'une tâche au projet ${projectId}:`, taskData);

      // Utiliser l'API pour ajouter une tâche
      const newTask = await projectsAPI.addTask(projectId, taskData);
      console.log('Tâche ajoutée via API:', newTask);

      // Mettre à jour l'état local du projet sélectionné
      if (selectedProject && selectedProject.id === projectId) {
        const updatedTasks = [...(selectedProject.tasks || []), newTask];

        // Recalculer la progression
        const completedTasks = updatedTasks.filter(task => task.completed).length;
        const progress = updatedTasks.length > 0
          ? Math.round((completedTasks / updatedTasks.length) * 100)
          : 0;

        const updatedProject = {
          ...selectedProject,
          tasks: updatedTasks,
          progress
        };

        setSelectedProject(updatedProject);

        // Mettre également à jour la liste des projets
        const updatedProjects = projects.map(project =>
          project.id === projectId ? { ...project, progress } : project
        );

        setProjects(updatedProjects);
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la tâche:', error);
      toast.error("Une erreur est survenue lors de l'ajout de la tâche: " + (error.message || 'Erreur inconnue'));
    }
  };

  // Mise à jour du statut d'une tâche via l'API
  const handleToggleTaskStatus = async (projectId, taskId) => {
    try {
      if (!selectedProject || !selectedProject.tasks) {
        throw new Error("Données du projet non disponibles");
      }

      // Trouver la tâche actuelle pour connaître son statut
      const task = selectedProject.tasks.find(t => t.id === taskId);
      if (!task) return;

      console.log(`Changement du statut de la tâche ${taskId} du projet ${projectId} à: ${!task.completed}`);

      // Utiliser l'API pour mettre à jour le statut de la tâche
      const updatedTask = await projectsAPI.updateTask(projectId, taskId, {
        completed: !task.completed
      });
      console.log('Statut de la tâche mis à jour via API:', updatedTask);

      // Mettre à jour l'état local du projet sélectionné
      const updatedTasks = selectedProject.tasks.map(task =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      );

      // Recalculer la progression
      const completedTasks = updatedTasks.filter(task => task.completed).length;
      const progress = updatedTasks.length > 0
        ? Math.round((completedTasks / updatedTasks.length) * 100)
        : 0;

      const updatedProject = {
        ...selectedProject,
        tasks: updatedTasks,
        progress
      };

      setSelectedProject(updatedProject);

      // Mettre également à jour la liste des projets
      const updatedProjects = projects.map(project =>
        project.id === projectId ? { ...project, progress } : project
      );

      setProjects(updatedProjects);
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la tâche:', error);
      toast.error("Une erreur est survenue lors de la mise à jour de la tâche: " + (error.message || 'Erreur inconnue'));
    }
  };

  // Affichage pendant le chargement
  if (isLoading && projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  // Affichage en cas d'erreur
  if (error && projects.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-4">
        <div className="text-3xl sm:text-4xl mb-4"><FiAlertTriangle /></div>
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">Erreur de chargement</h2>
        <p className="text-sm sm:text-base text-gray-300 mb-4 text-center">{error}</p>
        <button
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm sm:text-base"
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="mb-4 sm:mb-6 px-2 sm:px-0 pt-16 sm:pt-0">
        <motion.h1
          className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Projets
        </motion.h1>
        <motion.p
          className="text-indigo-200 mt-2 text-sm sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Gérez vos projets et suivez leur avancement
        </motion.p>
      </header>

      {/* Statistiques */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 px-2 sm:px-0">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-gray-400 text-xs mb-1">Total Projets</div>
            <div className="text-white text-2xl font-bold">{stats.total || 0}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <div className="text-green-400 text-xs mb-1">Actifs</div>
            <div className="text-white text-2xl font-bold">{stats.active || 0}</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <div className="text-blue-400 text-xs mb-1">Terminés</div>
            <div className="text-white text-2xl font-bold">{stats.completed || 0}</div>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
            <div className="text-purple-400 text-xs mb-1">Budget Total</div>
            <div className="text-white text-2xl font-bold">{stats.totalBudget || 0}€</div>
          </div>
        </div>
      )}

      {view === 'timeline' ? (
        /* Vue Timeline/Gantt */
        <motion.div
          className="flex-grow overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <TimelineView
            projects={filteredProjects}
            onProjectClick={handleSelectProject}
          />
        </motion.div>
      ) : (
        /* Vue Liste */
        <div className="flex flex-col lg:flex-row flex-grow overflow-hidden gap-4">
          {/* Panneau de gauche: Liste des projets */}
          <motion.div
            className={`${showDetails ? 'hidden lg:flex' : 'flex'} w-full lg:w-1/3 overflow-hidden flex-col`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3 px-2 sm:px-0">
            <div className="flex items-center gap-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Vos Projets</h2>
              <div className="bg-gray-800/50 rounded-lg p-1 flex">
                <motion.button
                  className={`px-3 py-1 rounded-lg text-sm flex items-center gap-1 transition-colors ${
                    view === 'list' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                  onClick={() => setView('list')}
                  whileTap={{ scale: 0.95 }}
                >
                  <FiList size={14} /> Liste
                </motion.button>
                <motion.button
                  className={`px-3 py-1 rounded-lg text-sm flex items-center gap-1 transition-colors ${
                    view === 'timeline' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                  onClick={() => setView('timeline')}
                  whileTap={{ scale: 0.95 }}
                >
                  <FiCalendar size={14} /> Timeline
                </motion.button>
              </div>
            </div>
            <div className="flex gap-2">
              <motion.button
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-full flex items-center text-sm sm:text-base"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => exportAPI.projects()}
                title="Exporter les projets en CSV"
              >
                <FiDownload className="mr-1" /> Exporter
              </motion.button>
              <motion.button
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-full flex items-center text-sm sm:text-base"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddProject}
              >
                <span className="mr-1">+</span> Nouveau Projet
              </motion.button>
            </div>
          </div>

          <div className="px-2 sm:px-0">
            <ProjectFilter
              filters={filters}
              setFilters={setFilters}
              onSort={handleSort}
              sortField={sortField}
              sortDirection={sortDirection}
            />
          </div>

          <div className="flex-grow overflow-y-auto px-2 sm:px-0 space-y-3 mt-4">
            <AnimatePresence>
              {filteredProjects.length > 0 ? (
                filteredProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                    layout
                  >
                    <ProjectCard
                      project={project}
                      isSelected={selectedProject && selectedProject.id === project.id}
                      onClick={() => handleSelectProject(project)}
                    />
                  </motion.div>
                ))
              ) : (
                <EmptyState
                  icon={<FiZap />}
                  title="Aucun projet trouvé"
                  description={filters.search || filters.status !== 'all' || filters.type !== 'all' || filters.timeframe !== 'all' ?
                    "Modifiez vos filtres pour voir plus de projets." :
                    "Ajoutez de nouveaux projets pour commencer."
                  }
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Panneau de droite: Détails du projet ou formulaire d'ajout */}
        <motion.div
          className={`${showDetails ? 'flex' : 'hidden lg:flex'} w-full lg:w-2/3 overflow-hidden flex-col`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {/* Bouton retour mobile */}
          {showDetails && (
            <motion.button
              className="lg:hidden mb-3 flex items-center text-purple-300 hover:text-purple-200 px-2"
              onClick={handleBackToList}
              whileTap={{ scale: 0.95 }}
            >
              <FiArrowLeft className="mr-2" />
              <span className="text-sm">Retour à la liste</span>
            </motion.button>
          )}

          <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 h-full overflow-y-auto">
            {isLoading && selectedProject ? (
              <div className="h-full flex items-center justify-center">
                <motion.div
                  className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-purple-500 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {isAddingProject ? (
                  <motion.div
                    key="add-form"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ProjectForm
                      onSave={handleSaveProject}
                      onCancel={handleBackToList}
                    />
                  </motion.div>
                ) : selectedProject ? (
                  <motion.div
                    key={`project-${selectedProject.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ProjectDetails
                      project={selectedProject}
                      onUpdate={(updatedData) => handleUpdateProject(selectedProject.id, updatedData)}
                      onDelete={() => handleDeleteProject(selectedProject.id)}
                      onAddTask={(taskData) => handleAddTask(selectedProject.id, taskData)}
                      onToggleTaskStatus={(taskId) => handleToggleTaskStatus(selectedProject.id, taskId)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex items-center justify-center"
                  >
                    <EmptyState
                      icon={<FiTarget />}
                      title="Sélectionnez un projet"
                      description="Choisissez un projet dans la liste ou créez-en un nouveau."
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </motion.div>
        </div>
      )}

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />
    </div>
  );
};

export default Projects;
