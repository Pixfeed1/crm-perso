// src/pages/Projects.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { projectsAPI } from '../services/api';
import { FiAlertTriangle, FiRocket, FiTarget } from 'react-icons/fi';

// Composants
import ProjectCard from '../components/projects/ProjectCard';
import ProjectDetails from '../components/projects/ProjectDetails';
import ProjectForm from '../components/projects/ProjectForm';
import ProjectFilter from '../components/projects/ProjectFilter';
import EmptyState from '../components/common/EmptyState';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    type: 'all',
    timeframe: 'all'
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

  // Filtrage des projets
  useEffect(() => {
    const result = projects.filter(project => {
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
    
    setFilteredProjects(result);
  }, [projects, filters]);

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
    } catch (error) {
      console.error(`Erreur lors du chargement des détails du projet ${project.id}:`, error);
      // Utiliser les informations de base du projet si les détails ne peuvent pas être chargés
      setSelectedProject({
        ...project,
        progress: project.progress || 0,
        tasks: []
      });
      setIsAddingProject(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Ajout d'un nouveau projet
  const handleAddProject = () => {
    setSelectedProject(null);
    setIsAddingProject(true);
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
      alert("Une erreur est survenue lors de la création du projet: " + (error.message || 'Erreur inconnue'));
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
      alert("Une erreur est survenue lors de la mise à jour du projet: " + (error.message || 'Erreur inconnue'));
    }
  };

  // Suppression d'un projet via l'API
  const handleDeleteProject = async (id) => {
    try {
      console.log(`Suppression du projet ${id}`);
      
      // Utiliser l'API pour supprimer le projet
      await projectsAPI.delete(id);
      console.log('Projet supprimé via API');
      
      // Mettre à jour l'état local
      const remainingProjects = projects.filter(project => project.id !== id);
      
      setProjects(remainingProjects);
      setSelectedProject(null);
    } catch (error) {
      console.error('Erreur lors de la suppression du projet:', error);
      alert("Une erreur est survenue lors de la suppression du projet: " + (error.message || 'Erreur inconnue'));
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
      alert("Une erreur est survenue lors de l'ajout de la tâche: " + (error.message || 'Erreur inconnue'));
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
      alert("Une erreur est survenue lors de la mise à jour de la tâche: " + (error.message || 'Erreur inconnue'));
    }
  };

  // Affichage pendant le chargement
  if (isLoading && projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  // Affichage en cas d'erreur
  if (error && projects.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-4xl mb-4"><FiAlertTriangle /></div>
        <h2 className="text-xl font-semibold text-white mb-2">Erreur de chargement</h2>
        <p className="text-gray-300 mb-4">{error}</p>
        <button 
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="mb-6">
        <motion.h1 
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Projets
        </motion.h1>
        <motion.p 
          className="text-indigo-200 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Gérez vos projets et suivez leur avancement
        </motion.p>
      </header>

      <div className="flex flex-grow h-[calc(100%-80px)] overflow-hidden">
        {/* Panneau de gauche: Liste des projets */}
        <motion.div 
          className="w-1/3 pr-4 overflow-hidden flex flex-col"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Vos Projets</h2>
            <motion.button
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-full flex items-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAddProject}
            >
              <span className="mr-1">+</span> Nouveau Projet
            </motion.button>
          </div>
          
          <ProjectFilter filters={filters} setFilters={setFilters} />
          
          <div className="flex-grow overflow-y-auto pr-2 space-y-3 mt-4">
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
                  icon={<FiRocket />}
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
          className="w-2/3 pl-4 overflow-hidden"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6 h-full overflow-y-auto">
            {isLoading && selectedProject ? (
              <div className="h-full flex items-center justify-center">
                <motion.div
                  className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full"
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
                      onCancel={() => setIsAddingProject(false)}
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
    </div>
  );
};

export default Projects;