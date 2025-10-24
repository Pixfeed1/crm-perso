// src/components/activities/ActivityForm.jsx
import React, { useState } from 'react';
import FormInput from '../common/FormInput';
import FormSelect from '../common/FormSelect';
import { FormButtons } from '../common/Button';

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
    { value: 'development', label: '💻 Développement' },
    { value: 'design', label: '🎨 Design' },
    { value: 'meeting', label: '👥 Réunion' },
    { value: 'call', label: '📞 Appel' },
    { value: 'marketing', label: '📢 Marketing' },
    { value: 'maintenance', label: '🔧 Maintenance' }
  ];
  
  const priorityLevels = [
    { value: 'high', label: '🔴 Haute' },
    { value: 'medium', label: '🟠 Moyenne' },
    { value: 'low', label: '🔵 Basse' }
  ];

  return (
    <div className="w-full px-0">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300">
        {activity.id ? 'Modifier l\'activité' : 'Nouvelle activité'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description */}
        <FormInput
          label="Description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          error={errors.description}
          placeholder="Ex: Développement de la page d'accueil"
          required
          variant="light"
        />
        
        {/* Type et priorité */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormSelect
            label="Type d'activité"
            name="type"
            value={formData.type}
            onChange={handleInputChange}
            options={activityTypes}
            variant="light"
          />

          <FormSelect
            label="Priorité"
            name="priority"
            value={formData.priority}
            onChange={handleInputChange}
            options={priorityLevels}
            variant="light"
          />
        </div>
        
        {/* Date et temps prévu */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Date"
            type="date"
            name="date"
            value={formData.date}
            onChange={handleInputChange}
            error={errors.date}
            required
            variant="light"
          />

          <FormInput
            label="Temps prévu (min)"
            type="number"
            name="planned_time"
            value={formData.planned_time}
            onChange={handleInputChange}
            error={errors.planned_time}
            min="1"
            required
            variant="light"
          />
        </div>
        
        {/* Projet */}
        <FormSelect
          label="Projet associé"
          name="project_id"
          value={formData.project_id}
          onChange={handleInputChange}
          options={projects ? projects.map(project => ({ value: project.id, label: project.name })) : []}
          placeholder="Aucun projet"
          variant="light"
        />
        
        {/* Lead */}
        <div className="w-full">
          <div className="flex items-center mb-2">
            <label htmlFor="lead_name" className="block text-sm font-medium text-gray-300">
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
              <label htmlFor="show_lead" className="text-xs text-gray-400">
                Associer un lead
              </label>
            </div>
          </div>

          {showLeadInput && (
            <FormInput
              name="lead_name"
              value={formData.lead_name}
              onChange={handleInputChange}
              placeholder="Nom du lead"
              variant="light"
            />
          )}
        </div>
        
        {/* Boutons d'actions */}
        <FormButtons
          onCancel={onCancel}
          submitLabel={activity.id ? 'Mettre à jour' : 'Enregistrer'}
          cancelLabel="Annuler"
          className="pt-4"
        />
      </form>
    </div>
  );
};

export default ActivityForm;