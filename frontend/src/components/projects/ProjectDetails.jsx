// src/components/projects/ProjectDetails.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiGlobe, FiSmartphone, FiMonitor, FiEdit2, FiRadio, FiTool, FiPackage, FiClipboard, FiRotateCw, FiCalendar, FiCheckCircle, FiPauseCircle, FiXCircle, FiHelpCircle, FiTrash2, FiFileText, FiCheck, FiX, FiPlus } from 'react-icons/fi';

// Sous-composants
import TaskList from './TaskList';
import TaskForm from './TaskForm';
import ProjectPayments from './ProjectPayments';
import InterventionList from './InterventionList';
import InterventionForm from './InterventionForm';
import { interventionsAPI } from '../../services/api';

const ProjectDetails = ({ project, onUpdate, onDelete, onAddTask, onToggleTaskStatus, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // États pour les interventions (projets maintenance)
  const [interventions, setInterventions] = useState([]);
  const [interventionStats, setInterventionStats] = useState(null);
  const [isAddingIntervention, setIsAddingIntervention] = useState(false);
  const [loadingInterventions, setLoadingInterventions] = useState(false);

  // Charger les interventions pour les projets de type maintenance
  useEffect(() => {
    if (project?.type === 'maintenance' && project?.id) {
      loadInterventions();
    }
  }, [project?.id, project?.type]);

  const loadInterventions = async () => {
    try {
      setLoadingInterventions(true);
      const [interventionsData, statsData] = await Promise.all([
        interventionsAPI.getByProject(project.id),
        interventionsAPI.getStats(project.id)
      ]);
      setInterventions(interventionsData);
      setInterventionStats(statsData);
    } catch (error) {
      console.error('Erreur chargement interventions:', error);
    } finally {
      setLoadingInterventions(false);
    }
  };

  const handleSaveIntervention = async (data) => {
    try {
      await interventionsAPI.create(project.id, data);
      setIsAddingIntervention(false);
      loadInterventions();
    } catch (error) {
      console.error('Erreur création intervention:', error);
    }
  };

  const handleToggleInterventionStatus = async (interventionId, newStatus) => {
    try {
      await interventionsAPI.update(interventionId, { status: newStatus });
      loadInterventions();
    } catch (error) {
      console.error('Erreur mise à jour intervention:', error);
    }
  };

  // Configuration des couleurs de statut
  const statusConfig = {
    'en-cours': {
      bg: 'bg-blue-500/20',
      text: 'text-blue-300',
      border: 'border-blue-500/30',
      label: 'En cours',
      icon: <FiRotateCw />
    },
    'planifié': {
      bg: 'bg-purple-500/20',
      text: 'text-purple-300',
      border: 'border-purple-500/30',
      label: 'Planifié',
      icon: <FiCalendar />
    },
    'terminé': {
      bg: 'bg-emerald-500/20',
      text: 'text-emerald-300',
      border: 'border-emerald-500/30',
      label: 'Terminé',
      icon: <FiCheckCircle />
    },
    'pause': {
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      label: 'En pause',
      icon: <FiPauseCircle />
    },
    'annulé': {
      bg: 'bg-rose-500/20',
      text: 'text-rose-300',
      border: 'border-rose-500/30',
      label: 'Annulé',
      icon: <FiXCircle />
    }
  };

  // Configuration des icônes de type
  const typeConfig = {
    'site-web': { icon: <FiGlobe />, label: 'Site Web' },
    'application-mobile': { icon: <FiSmartphone />, label: 'App Mobile' },
    'application-bureau': { icon: <FiMonitor />, label: 'App Bureau' },
    'design': { icon: <FiEdit2 />, label: 'Design' },
    'marketing': { icon: <FiRadio />, label: 'Marketing' },
    'maintenance': { icon: <FiTool />, label: 'Maintenance' },
    'autre': { icon: <FiPackage />, label: 'Autre' }
  };

  // Valeurs par défaut si le statut ou type n'est pas configuré
  const statusStyle = statusConfig[project.status] || {
    bg: 'bg-gray-500/20',
    text: 'text-text-secondary',
    border: 'border-gray-500/30',
    label: project.status,
    icon: <FiHelpCircle />
  };

  const typeInfo = typeConfig[project.type] || { icon: <FiClipboard />, label: project.type };
  
  // Format des dates
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', { 
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };
  
  // Calcul du nombre de jours
  const getDaysDifference = () => {
    const startDate = new Date(project.start_date);
    const endDate = new Date(project.end_date);
    const diffTime = endDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };
  
  const totalDays = getDaysDifference();
  
  // Calcul du nombre de jours restants
  const getDaysRemaining = () => {
    const now = new Date();
    const endDate = new Date(project.end_date);
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };
  
  const daysRemaining = getDaysRemaining();
  
  // Calcul du nombre de jours écoulés
  const getDaysElapsed = () => {
    const now = new Date();
    const startDate = new Date(project.start_date);
    if (now < startDate) return 0;
    
    const diffTime = Math.min(now, new Date(project.end_date)) - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };
  
  const daysElapsed = getDaysElapsed();
  
  // Mise à jour du statut du projet
  const handleStatusChange = async (newStatus) => {
    try {
      await onUpdate({ status: newStatus });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
    }
  };
  
  // Sauvegarde des modifications du projet
  const handleSaveEdit = async (formData) => {
    try {
      await onUpdate(formData);
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du projet:', error);
    }
  };
  
  // Sauvegarde d'une nouvelle tâche
  const handleSaveTask = async (taskData) => {
    try {
      await onAddTask(taskData);
      setIsAddingTask(false);
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la tâche:', error);
    }
  };
  
  // Confirmation et suppression du projet
  const handleConfirmDelete = async () => {
    try {
      await onDelete();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Erreur lors de la suppression du projet:', error);
    }
  };

  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-border/50">
      {/* En-tête avec actions */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300">
            {project.name}
          </h2>
          <div className="flex items-center text-lg text-purple-300 mt-1">
            <span className="mr-2">{typeInfo.icon}</span>
            <span>{typeInfo.label}</span>
            {(project.display_name || project.client_name || project.lead_name) && (
              <>
                <span className="mx-2">•</span>
                <span>{project.display_name || project.client_name || project.lead_name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300"
            onClick={() => setIsEditing(true)}
          >
            <FiEdit2 />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <FiTrash2 />
          </motion.button>

          {onClose && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-lg bg-border-strong/30 hover:bg-border-strong/50 text-text-secondary"
              onClick={onClose}
            >
              <FiX />
            </motion.button>
          )}
        </div>
      </div>
      
      {/* Informations principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Panneau de gauche (Informations) */}
        <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center">
            <span className="mr-2"><FiClipboard /></span>
            Détails du projet
          </h3>
          
          <div className="space-y-4">
            {/* Statut avec menu déroulant */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Statut</span>
              
              <div className="relative group">
                <button 
                  className={`flex items-center px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border} text-sm font-medium`}
                >
                  <span className="mr-1">{statusStyle.icon}</span>
                  {statusStyle.label}
                  <span className="ml-1">▼</span>
                </button>
                
                {/* Menu déroulant pour changer le statut */}
                <div className="absolute right-0 mt-2 w-48 bg-surface-muted border border-border rounded-lg shadow-lg z-10 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
                  {Object.keys(statusConfig).map(status => (
                    <button
                      key={status}
                      className={`w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface flex items-center ${
                        project.status === status ? 'bg-surface' : ''
                      }`}
                      onClick={() => handleStatusChange(status)}
                    >
                      <span className="mr-2">{statusConfig[status].icon}</span>
                      {statusConfig[status].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Dates */}
            <div className="flex justify-between">
              <span className="text-text-muted">Début</span>
              <span className="font-medium text-text-primary">{formatDate(project.start_date)}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-text-muted">Fin</span>
              <span className="font-medium text-text-primary">{formatDate(project.end_date)}</span>
            </div>
            
            {/* Durée */}
            <div className="flex justify-between">
              <span className="text-text-muted">Durée</span>
              <span className="font-medium text-text-primary">{totalDays} jours</span>
            </div>
            
            {/* Jours restants (si le projet n'est pas terminé) */}
            {project.status !== 'terminé' && project.status !== 'annulé' && (
              <div className="flex justify-between">
                <span className="text-text-muted">Restant</span>
                <span className={`font-medium ${
                  daysRemaining <= 7 ? 'text-rose-300' : 'text-text-primary'
                }`}>
                  {daysRemaining} jour{daysRemaining > 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            {/* Montant */}
            <div className="flex justify-between">
              <span className="text-text-muted">Montant</span>
              <span className="font-medium text-text-primary">{(project.amount || project.budget || 0).toLocaleString()} €</span>
            </div>
          </div>
        </div>
        
        {/* Panneau de droite (Description) */}
        <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center">
            <span className="mr-2"><FiFileText /></span>
            Description
          </h3>
          
          <div className="bg-surface-muted/50 rounded-lg p-4 min-h-[120px] text-text-secondary">
            {project.description || 'Aucune description pour ce projet.'}
          </div>
          
          {/* Progression */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-text-muted">Progression</span>
              <span className="text-sm font-medium text-text-primary">{project.progress}%</span>
            </div>
            <div className="h-3 bg-surface-muted/70 rounded-full overflow-hidden">
              <motion.div 
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                initial={{ width: 0 }}
                animate={{ width: `${project.progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            
            {/* Visualisation de la période écoulée */}
            <div className="mt-3 flex justify-between text-xs text-text-muted">
              <span>{formatDate(project.start_date)}</span>
              <span>{formatDate(project.end_date)}</span>
            </div>
            <div className="mt-1 h-2 bg-surface-muted/70 rounded-full overflow-hidden">
              <div 
                className="h-full bg-surface-strong"
                style={{ width: `${(daysElapsed / totalDays) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section Paiements */}
      <ProjectPayments project={project} />

      {/* Section Tâches */}
      <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-5 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-text-primary flex items-center">
            <span className="mr-2"><FiCheck /></span>
            Tâches
          </h3>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 px-3 py-1 rounded-lg text-sm flex items-center"
            onClick={() => setIsAddingTask(true)}
          >
            <span className="mr-1">+</span>
            Ajouter une tâche
          </motion.button>
        </div>
        
        {/* Liste des tâches ou formulaire d'ajout */}
        <AnimatePresence mode="wait">
          {isAddingTask ? (
            <motion.div
              key="task-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <TaskForm 
                onSave={handleSaveTask}
                onCancel={() => setIsAddingTask(false)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="task-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <TaskList 
                tasks={project.tasks || []}
                onToggleStatus={onToggleTaskStatus}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Section Interventions (uniquement pour les projets maintenance) */}
      {project.type === 'maintenance' && (
        <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-text-primary flex items-center">
              <span className="mr-2"><FiTool /></span>
              Interventions
            </h3>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 px-3 py-1 rounded-lg text-sm flex items-center"
              onClick={() => setIsAddingIntervention(true)}
            >
              <FiPlus className="mr-1" />
              Ajouter une intervention
            </motion.button>
          </div>

          {/* Liste des interventions ou formulaire d'ajout */}
          <AnimatePresence mode="wait">
            {isAddingIntervention ? (
              <motion.div
                key="intervention-form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <InterventionForm
                  onSave={handleSaveIntervention}
                  onCancel={() => setIsAddingIntervention(false)}
                />
              </motion.div>
            ) : loadingInterventions ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center py-8"
              >
                <motion.div
                  className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="intervention-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <InterventionList
                  interventions={interventions}
                  stats={interventionStats}
                  onToggleStatus={handleToggleInterventionStatus}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Les rapports de maintenance sont désormais gérés via la page /maintenance */}

      {/* Modal d'édition */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsEditing(false)}
          >
            <motion.div
              className="bg-surface-muted border border-border rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-semibold text-text-primary mb-4">Modifier le projet</h3>

              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                handleSaveEdit({
                  name: formData.get('name'),
                  type: formData.get('type'),
                  description: formData.get('description'),
                  start_date: formData.get('start_date'),
                  end_date: formData.get('end_date'),
                  status: formData.get('status'),
                  amount: parseFloat(formData.get('amount')) || 0
                });
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Nom du projet *</label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={project.name}
                      required
                      className="w-full bg-surface text-gray-100 border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Type *</label>
                      <select
                        name="type"
                        defaultValue={project.type}
                        required
                        className="w-full bg-surface text-gray-100 border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="site-web">Site Web</option>
                        <option value="application-mobile">App Mobile</option>
                        <option value="application-bureau">App Bureau</option>
                        <option value="design">Design</option>
                        <option value="marketing">Marketing</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="autre">Autre</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Statut *</label>
                      <select
                        name="status"
                        defaultValue={project.status}
                        required
                        className="w-full bg-surface text-gray-100 border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="planifié">Planifié</option>
                        <option value="en-cours">En cours</option>
                        <option value="pause">En pause</option>
                        <option value="terminé">Terminé</option>
                        <option value="annulé">Annulé</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
                    <textarea
                      name="description"
                      defaultValue={project.description || ''}
                      rows={3}
                      className="w-full bg-surface text-gray-100 border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Date de début *</label>
                      <input
                        type="date"
                        name="start_date"
                        defaultValue={project.start_date}
                        required
                        className="w-full bg-surface text-gray-100 border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Date de fin *</label>
                      <input
                        type="date"
                        name="end_date"
                        defaultValue={project.end_date}
                        required
                        className="w-full bg-surface text-gray-100 border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Montant (€)</label>
                    <input
                      type="number"
                      name="amount"
                      defaultValue={project.amount || project.budget || 0}
                      step="0.01"
                      min="0"
                      className="w-full bg-surface text-gray-100 border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <motion.button
                    type="button"
                    className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsEditing(false)}
                  >
                    Annuler
                  </motion.button>

                  <motion.button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Enregistrer
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popup de confirmation de suppression */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-surface-muted border border-border rounded-xl p-6 max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-xl font-semibold text-text-primary mb-2">Confirmer la suppression</h3>
              <p className="text-text-secondary mb-6">
                Êtes-vous sûr de vouloir supprimer définitivement ce projet ? Cette action ne peut pas être annulée.
              </p>
              
              <div className="flex justify-end space-x-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </motion.button>
                
                <motion.button
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirmDelete}
                >
                  Supprimer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProjectDetails;