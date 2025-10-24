// src/pages/Activities.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClipboard, FiCalendar, FiEdit2, FiTrash2, FiMonitor, FiEdit, FiUsers, FiPhone, FiMegaphone, FiTool, FiCheck, FiDownload } from 'react-icons/fi';
import { useToast } from '../hooks/useToast';
// Importer vos services d'API
import { activitiesAPI, projectsAPI, exportAPI } from '../services/api';

// Composants internes
import ActivityStats from '../components/activities/ActivityStats';
import ActivityList from '../components/activities/ActivityList';
import ActivityForm from '../components/activities/ActivityForm';
import ActivityFilter from '../components/activities/ActivityFilter';
import ActivityCalendar from '../components/activities/ActivityCalendar';
import EmptyState from '../components/common/EmptyState';

const Activities = () => {
  const { toast } = useToast();
  const [activities, setActivities] = useState([]);
  const [filteredActivities, setFilteredActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [endDate, setEndDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' ou 'calendar'
  const [stats, setStats] = useState({
    completed: 0,
    pending: 0,
    total: 0,
    completion_rate: 0,
    planned_time: 0,
    actual_time: 0,
    time_efficiency: 0
  });
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    priority: 'all',
    status: 'all',
    project: 'all'
  });
  const [projects, setProjects] = useState([]);

  // Charger les projets et activités via l'API
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Récupérer les projets
        try {
          const projectsData = await projectsAPI.getAll();
          setProjects(projectsData);
          console.log('Projets chargés:', projectsData);
        } catch (pErr) {
          console.error('Erreur lors du chargement des projets:', pErr);
          // on continue, même si échec
          setProjects([]); // Initialiser à un tableau vide pour éviter les erreurs
        }

        // Récupérer les activités
        const activitiesData = await activitiesAPI.getAll();
        console.log('Activités chargées via API:', activitiesData);

        // Adapter au besoin
        const formattedActivities = activitiesData.map((activity) => ({
          ...activity,
          planned_time: parseInt(activity.planned_time || 0, 10),
          actual_time: parseInt(activity.actual_time || 0, 10),
          status: activity.status || 'planned',
          priority: activity.priority || 'medium'
        }));

        setActivities(formattedActivities);
        setFilteredActivities(formattedActivities);

        // Calcul stats
        calculateStats(formattedActivities);
      } catch (err) {
        console.error('Erreur lors du chargement des activités:', err);
        // En cas d'erreur, on utilise un tableau vide
        setActivities([]);
        setFilteredActivities([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculer les stats
  const calculateStats = (activityData) => {
    const completed = activityData.filter(a => a.status === 'completed').length;
    const total = activityData.length;
    const completion_rate = total > 0 ? (completed / total) * 100 : 0;

    const planned_time = activityData.reduce(
      (sum, a) => sum + (a.planned_time || 0),
      0
    );
    const actual_time = activityData
      .filter(a => a.status === 'completed')
      .reduce((sum, a) => sum + (a.actual_time || 0), 0);

    const completed_planned_time = activityData
      .filter(a => a.status === 'completed')
      .reduce((sum, a) => sum + (a.planned_time || 0), 0);

    const time_efficiency =
      completed_planned_time > 0 && actual_time > 0
        ? (completed_planned_time / actual_time) * 100
        : 0;

    setStats({
      completed,
      pending: total - completed,
      total,
      completion_rate,
      planned_time,
      actual_time,
      time_efficiency
    });
  };

  // Filtrer selon la recherche, type, priorité, statut, projet, et la période
  useEffect(() => {
    let result = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      const inPeriod = activityDate >= startDate && activityDate <= endDate;
      if (!inPeriod) return false;

      const search = filters.search.toLowerCase();
      const matchSearch =
        filters.search === '' ||
        (activity.description && activity.description.toLowerCase().includes(search)) ||
        (activity.project_name && activity.project_name.toLowerCase().includes(search)) ||
        (activity.lead_name && activity.lead_name.toLowerCase().includes(search));

      const matchType = filters.type === 'all' || activity.type === filters.type;
      const matchPriority = filters.priority === 'all' || activity.priority === filters.priority;
      const matchStatus = filters.status === 'all' || activity.status === filters.status;
      const matchProject =
        filters.project === 'all' ||
        (filters.project === 'none' && activity.project_id === null) ||
        (activity.project_id !== null && activity.project_id.toString() === filters.project);

      return matchSearch && matchType && matchPriority && matchStatus && matchProject;
    });

    // Trier par date descendante
    result = result.sort((a, b) => new Date(b.date) - new Date(a.date));
    setFilteredActivities(result);
  }, [activities, filters, startDate, endDate]);

  // Gestion de la période
  const handlePeriodChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Sélection / ajout
  const handleSelectActivity = (activity) => {
    setSelectedActivity(activity);
    setIsAddingActivity(false);
  };
  const handleAddActivity = () => {
    setSelectedActivity(null);
    setIsAddingActivity(true);
  };

  // Création d'activité
  const handleSaveActivity = async (formData) => {
    try {
      console.log('Création d\'activité avec:', formData);
      // Retirer le champ lead_name de l'objet à envoyer à l'API
      const { lead_name, ...dataWithoutLeadName } = formData;
      
      const newActivity = await activitiesAPI.create({
        type: formData.type,
        description: formData.description,
        planned_time: formData.planned_time,
        date: formData.date,
        priority: formData.priority,
        status: 'planned',
        project_id: formData.project_id || null
        // lead_name retiré de l'objet
      });

      console.log('Nouvelle activité:', newActivity);
      setActivities((prev) => {
        const updated = [...prev, newActivity];
        calculateStats(updated);
        return updated;
      });
      setIsAddingActivity(false);
      setSelectedActivity(newActivity);
    } catch (error) {
      console.error('Erreur lors de la création:', error);
      // Créer un message plus clair pour l'utilisateur
      let errorMessage = 'Erreur lors de la sauvegarde';
      
      if (error.message && error.message.includes('lead_name')) {
        errorMessage = 'Ce serveur ne prend pas en charge le champ "lead_name". Veuillez mettre à jour la base de données.';
      }

      toast.error(errorMessage);
    }
  };

  // Mise à jour
  const handleUpdateActivity = async (id, updatedData) => {
    try {
      console.log('Mise à jour activité ID:', id);
      // Retirer le champ lead_name de l'objet à envoyer à l'API si présent
      const { lead_name, ...dataWithoutLeadName } = updatedData;
      
      const updated = await activitiesAPI.update(id, dataWithoutLeadName);

      const updatedActivities = activities.map((a) =>
        a.id === id ? updated : a
      );
      setActivities(updatedActivities);
      calculateStats(updatedActivities);
      setSelectedActivity(updated);
    } catch (error) {
      console.error('Erreur de mise à jour:', error);
      toast.error('Erreur lors de la mise à jour: ' + error.message);
    }
  };

  // Suppression
  const handleDeleteActivity = async (id) => {
    try {
      console.log('Suppression activité ID:', id);
      await activitiesAPI.delete(id);
      const remaining = activities.filter(a => a.id !== id);

      setActivities(remaining);
      calculateStats(remaining);
      setSelectedActivity(null);
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast.error('Erreur lors de la suppression: ' + error.message);
    }
  };

  // Marquer comme terminé
  const handleCompleteActivity = async (id, actual_time) => {
    try {
      console.log('Compléter activité ID:', id, 'avec temps réel:', actual_time);
      const completed = await activitiesAPI.complete(id, actual_time);

      const updatedActivities = activities.map((a) =>
        a.id === id ? completed : a
      );
      setActivities(updatedActivities);
      calculateStats(updatedActivities);
      setSelectedActivity(completed);
    } catch (error) {
      console.error('Erreur completion:', error);
      toast.error('Erreur lors de la complétion: ' + error.message);
    }
  };

  if (isLoading) {
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

  return (
    <div className="h-full flex flex-col">
      {/* Titre de page */}
      <header className="mb-6">
        <motion.h1 
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Activités
        </motion.h1>
        <motion.p 
          className="text-indigo-200 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Suivez vos tâches quotidiennes et optimisez votre productivité
        </motion.p>
      </header>

      {/* Statistiques globales */}
      <ActivityStats stats={stats} />

      {/* Filtres et sélecteurs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 sm:gap-0">
        <ActivityFilter
          filters={filters}
          setFilters={setFilters}
          projects={projects}
          startDate={startDate}
          endDate={endDate}
          onPeriodChange={handlePeriodChange}
        />
        <div className="flex items-center space-x-3">
          {/* Sélecteur de vue : liste / calendrier */}
          <div className="bg-gray-800/50 rounded-lg p-1 flex">
            <motion.button
              className={`px-3 py-1 rounded-lg text-sm flex items-center ${
                view === 'list'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
              whileHover={{ scale: view === 'list' ? 1 : 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView('list')}
            >
              <FiClipboard className="mr-1" />
              Liste
            </motion.button>
            <motion.button
              className={`px-3 py-1 rounded-lg text-sm flex items-center ${
                view === 'calendar'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
              whileHover={{ scale: view === 'calendar' ? 1 : 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView('calendar')}
            >
              <FiCalendar className="mr-1" />
              Calendrier
            </motion.button>
          </div>
          {/* Boutons export et ajout */}
          <motion.button
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => exportAPI.activities()}
            title="Exporter les activités en CSV"
          >
            <FiDownload className="mr-1" /> Exporter
          </motion.button>
          <motion.button
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAddActivity}
          >
            <span className="mr-2">+</span>
            Activité
          </motion.button>
        </div>
      </div>

      {/* Conteneur principal (grille) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        {/* 1) Vue principale (liste/calendrier) */}
        <div className="lg:col-span-7 bg-gray-800/30 backdrop-blur-sm rounded-2xl p-3 sm:p-4 md:p-6 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {view === 'list' ? (
              <motion.div
                key="list-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                <h3 className="text-xl font-semibold text-white mb-4">Liste des activités</h3>
                <ActivityList
                  activities={filteredActivities}
                  selectedActivity={selectedActivity}
                  onSelectActivity={handleSelectActivity}
                  onCompleteActivity={handleCompleteActivity}
                />
              </motion.div>
            ) : (
              <motion.div
                key="calendar-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                <h3 className="text-xl font-semibold text-white mb-4">Calendrier des activités</h3>
                <ActivityCalendar
                  activities={filteredActivities}
                  startDate={startDate}
                  endDate={endDate}
                  onSelectActivity={handleSelectActivity}
                  onAddActivity={handleAddActivity}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 2) Panneau de détails ou formulaire
            Ici, on force l'overflow en 'hidden' pour empêcher tout défilement. */}
        <div className="
          lg:col-span-5
          bg-gray-800/30
          backdrop-blur-sm
          rounded-2xl
          p-2 sm:p-4 md:p-6
          overflow-hidden
        ">
          <AnimatePresence mode="wait">
            {isAddingActivity ? (
              /* Formulaire de création */
              <motion.div
                key="add-form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                <ActivityForm
                  onSave={handleSaveActivity}
                  onCancel={() => setIsAddingActivity(false)}
                  projects={projects}
                  defaultDate={new Date()}
                />
              </motion.div>
            ) : selectedActivity ? (
              /* Affichage des détails d'une activité */
              <motion.div
                key={`activity-${selectedActivity.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-white">Détails de l'activité</h3>
                  <div className="flex space-x-2">
                    {/* Bouton Editer (= recréer) */}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300"
                      onClick={() => {
                        setIsAddingActivity(true);
                        setSelectedActivity(null);
                      }}
                    >
                      <FiEdit2 />
                    </motion.button>
                    {/* Bouton Supprimer */}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
                      onClick={() => handleDeleteActivity(selectedActivity.id)}
                    >
                      <FiTrash2 />
                    </motion.button>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Type */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Type</span>
                    <span className="text-white capitalize flex items-center gap-1">
                      {selectedActivity.type === 'development' ? <><FiMonitor /> Développement</> :
                       selectedActivity.type === 'design'      ? <><FiEdit /> Design</>        :
                       selectedActivity.type === 'meeting'     ? <><FiUsers /> Réunion</>       :
                       selectedActivity.type === 'call'        ? <><FiPhone /> Appel</>         :
                       selectedActivity.type === 'marketing'   ? <><FiMegaphone /> Marketing</>     :
                       selectedActivity.type === 'maintenance' ? <><FiTool /> Maintenance</>   :
                       selectedActivity.type}
                    </span>
                  </div>
                  {/* Priorité */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Priorité</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        selectedActivity.priority === 'high'
                          ? 'bg-rose-900/30 text-rose-300'
                          : selectedActivity.priority === 'medium'
                          ? 'bg-amber-900/30 text-amber-300'
                          : 'bg-blue-900/30 text-blue-300'
                      }`}
                    >
                      {selectedActivity.priority === 'high'
                        ? 'Haute'
                        : selectedActivity.priority === 'medium'
                        ? 'Moyenne'
                        : 'Basse'}
                    </span>
                  </div>
                  {/* Date */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Date</span>
                    <span className="text-white">
                      {new Date(selectedActivity.date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  {/* Statut */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Statut</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        selectedActivity.status === 'completed'
                          ? 'bg-green-900/30 text-green-300'
                          : 'bg-amber-900/30 text-amber-300'
                      }`}
                    >
                      {selectedActivity.status === 'completed' ? 'Terminé' : 'Planifié'}
                    </span>
                  </div>
                  {/* Temps prévu / Temps réel */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Temps prévu</span>
                    <span className="text-white">
                      {Math.floor(selectedActivity.planned_time / 60)}h
                      {selectedActivity.planned_time % 60
                        ? `${selectedActivity.planned_time % 60}min`
                        : ''}
                    </span>
                  </div>
                  {selectedActivity.status === 'completed' && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Temps réel</span>
                      <span className="text-white">
                        {Math.floor(selectedActivity.actual_time / 60)}h
                        {selectedActivity.actual_time % 60
                          ? `${selectedActivity.actual_time % 60}min`
                          : ''}
                      </span>
                    </div>
                  )}
                  {/* Projet */}
                  {selectedActivity.project_name && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Projet</span>
                      <span className="text-indigo-300">{selectedActivity.project_name}</span>
                    </div>
                  )}
                  {/* Description */}
                  <div>
                    <span className="text-gray-400">Description</span>
                    <p className="mt-1 text-white break-words">
                      {selectedActivity.description}
                    </p>
                  </div>
                  {/* Bouton "Marquer comme terminé" */}
                  {selectedActivity.status !== 'completed' && (
                    <div className="pt-4">
                      <motion.button
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const actualTime = window.prompt(
                            "Temps réel passé (en minutes)",
                            selectedActivity.planned_time.toString()
                          );
                          if (actualTime !== null) {
                            handleCompleteActivity(
                              selectedActivity.id,
                              parseInt(actualTime, 10) || 0
                            );
                          }
                        }}
                      >
                        <FiCheck className="mr-2" />
                        Marquer comme terminé
                      </motion.button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              /* État vide (aucune activité sélectionnée et pas en mode ajout) */
              <motion.div
                key="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex items-center justify-center"
              >
                <EmptyState
                  icon={<FiClipboard />}
                  title="Activités"
                  description="Sélectionnez une activité dans la liste ou ajoutez-en une nouvelle."
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Activities;