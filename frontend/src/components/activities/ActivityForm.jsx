// src/components/activities/ActivityForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ActivityForm = ({ activity = {}, onSave, onCancel, projects, defaultDate }) => {
  const today = defaultDate ? new Date(defaultDate) : new Date();
  const formattedToday = today.toISOString().split('T')[0];
  
  const [formData, setFormData] = useState({
    description: activity.description || '',
    type: activity.type || 'development',
    date: activity.date || formattedToday,
    planned_time: activity.planned_time || 60,
    priority: activity.priority || 'medium',
    status: activity.status || 'pending',
    project_id: activity.project_id || '',
    lead_name: activity.lead_name || ''
  });
  
  const [errors, setErrors] = useState({});
  const [showLeadInput, setShowLeadInput] = useState(Boolean(formData.lead_name));
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Effacer l'erreur liée à ce champ
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };
  
  const validate = () => {
    const newErrors = {};
    
    if (!formData.description.trim()) {
      newErrors.description = 'La description est requise';
    }
    
    if (!formData.date) {
      newErrors.date = 'La date est requise';
    }
    
    if (!formData.planned_time || formData.planned_time <= 0) {
      newErrors.planned_time = 'Le temps planifié doit être supérieur à 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }
    
    // Préparer les données pour l'envoi
    const processedData = {
      ...formData,
      project_id: formData.project_id ? parseInt(formData.project_id, 10) : null,
      planned_time: parseInt(formData.planned_time, 10),
      lead_name: showLeadInput ? formData.lead_name : null
    };
    
    onSave(processedData);
  };
  
  const activityTypes = [
    { value: 'development', label: 'Développement' },
    { value: 'design', label: 'Design' },
    { value: 'meeting', label: 'Réunion' },
    { value: 'call', label: 'Appel' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'prospection', label: 'Prospection' }
  ];

  const priorityLevels = [
    { value: 'high', label: 'Haute' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'low', label: 'Basse' }
  ];

  return (
    <div className="w-full px-0">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300">
        {activity.id ? 'Modifier l\'activité' : 'Nouvelle activité'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description */}
        <div className="w-full">
          <label htmlFor="description" className="block text-sm font-medium text-text-secondary mb-1">
            Description <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className={`w-full bg-surface/50 text-text-primary border ${
              errors.description ? 'border-rose-500' : 'border-border'
            } rounded-lg px-2 sm:px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-text-muted`}
            placeholder="Ex: Développement de la page d'accueil"
          />
          {errors.description && (
            <span className="text-rose-500 text-xs">{errors.description}</span>
          )}
        </div>
        
        {/* Type et priorité */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="w-full">
            <label htmlFor="type" className="block text-sm font-medium text-text-secondary mb-1">
              Type d'activité
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-2 sm:px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            >
              {activityTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="w-full">
            <label htmlFor="priority" className="block text-sm font-medium text-text-secondary mb-1">
              Priorité
            </label>
            <select
              id="priority"
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
              className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-2 sm:px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            >
              {priorityLevels.map(priority => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Date et temps prévu */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="w-full">
            <label htmlFor="date" className="block text-sm font-medium text-text-secondary mb-1">
              Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 text-text-primary border ${
                errors.date ? 'border-rose-500' : 'border-border'
              } rounded-lg px-2 sm:px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm`}
            />
            {errors.date && (
              <span className="text-rose-500 text-xs">{errors.date}</span>
            )}
          </div>
          
          <div className="w-full">
            <label htmlFor="planned_time" className="block text-sm font-medium text-text-secondary mb-1">
              Temps prévu (min) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              id="planned_time"
              name="planned_time"
              value={formData.planned_time}
              onChange={handleInputChange}
              min="1"
              className={`w-full bg-surface/50 text-text-primary border ${
                errors.planned_time ? 'border-rose-500' : 'border-border'
              } rounded-lg px-2 sm:px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm`}
            />
            {errors.planned_time && (
              <span className="text-rose-500 text-xs">{errors.planned_time}</span>
            )}
          </div>
        </div>
        
        {/* Projet */}
        <div className="w-full">
          <label htmlFor="project_id" className="block text-sm font-medium text-text-secondary mb-1">
            Projet associé
          </label>
          <select
            id="project_id"
            name="project_id"
            value={formData.project_id}
            onChange={handleInputChange}
            className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-2 sm:px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          >
            <option value="">Aucun projet</option>
            {projects && projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        
        {/* Lead */}
        <div className="w-full">
          <div className="flex items-center mb-2">
            <label htmlFor="lead_name" className="block text-sm font-medium text-text-secondary">
              Lead associé
            </label>
            <div className="ml-2">
              <input
                type="checkbox"
                id="show_lead"
                checked={showLeadInput}
                onChange={() => setShowLeadInput(!showLeadInput)}
                className="mr-1"
              />
              <label htmlFor="show_lead" className="text-xs text-text-muted">
                Associer un lead
              </label>
            </div>
          </div>
          
          {showLeadInput && (
            <input
              type="text"
              id="lead_name"
              name="lead_name"
              value={formData.lead_name}
              onChange={handleInputChange}
              className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-2 sm:px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-text-muted text-sm"
              placeholder="Nom du lead"
            />
          )}
        </div>
        
        {/* Boutons d'actions */}
        <div className="flex justify-center sm:justify-end space-x-3 pt-4">
          <motion.button
            type="button"
            className="px-3 sm:px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 shadow-sm text-sm font-semibold transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onCancel}
          >
            Annuler
          </motion.button>
          
          <motion.button
            type="submit"
            className="px-3 sm:px-4 py-2 rounded-lg bg-accent hover:bg-indigo-700 text-white shadow-sm text-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {activity.id ? 'Mettre à jour' : 'Enregistrer'}
          </motion.button>
        </div>
      </form>
    </div>
  );
};

export default ActivityForm;