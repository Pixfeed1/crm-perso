// src/components/projects/TaskForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TaskForm = ({ task = {}, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'medium'
  });
  
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  
  // Options de priorité
  const priorityOptions = [
    { value: 'low', label: 'Basse', color: 'bg-border-strong text-text-primary' },
    { value: 'medium', label: 'Moyenne', color: 'bg-accent text-indigo-100' },
    { value: 'high', label: 'Haute', color: 'bg-amber-600 text-amber-100' },
    { value: 'critical', label: 'Critique', color: 'bg-rose-600 text-rose-100' }
  ];
  
  // Mise à jour des champs du formulaire
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Effacer les erreurs lors de la saisie
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };
  
  // Validation du formulaire
  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Le titre de la tâche est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Soumission du formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setSubmitting(true);
      await onSave(formData);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-muted/40 rounded-lg p-5 w-full max-w-full">
      <h4 className="text-lg font-medium text-purple-300 mb-4">
        {task.id ? 'Modifier la tâche' : 'Nouvelle tâche'}
      </h4>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Titre de la tâche */}
        <div>
          <label htmlFor="task-title" className="block text-sm font-medium text-text-secondary mb-1">
            Titre de la tâche<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="text"
            id="task-title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={`w-full bg-surface/50 text-text-primary border ${
              errors.title ? 'border-rose-500' : 'border-border'
            } rounded-lg px-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            placeholder="Développer la page d'accueil"
          />
          {errors.title && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.title}
            </motion.p>
          )}
        </div>
        
        {/* Description */}
        <div>
          <label htmlFor="task-description" className="block text-sm font-medium text-text-secondary mb-1">
            Description (optionnelle)
          </label>
          <textarea
            id="task-description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={2}
            className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Détails supplémentaires sur cette tâche..."
          />
        </div>
        
        {/* Priorité */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Priorité
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {priorityOptions.map(option => (
              <label 
                key={option.value}
                className={`py-2 rounded-lg cursor-pointer transition-colors text-center text-sm ${
                  formData.priority === option.value 
                    ? option.color
                    : 'bg-surface/50 text-text-muted hover:bg-surface-strong/50'
                }`}
              >
                <input 
                  type="radio" 
                  name="priority" 
                  value={option.value} 
                  checked={formData.priority === option.value} 
                  onChange={handleInputChange}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
        
        {/* Boutons d'action */}
        <div className="flex justify-end space-x-3 pt-2">
          <motion.button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
          >
            Annuler
          </motion.button>
          
          <motion.button
            type="submit"
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium flex items-center"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <motion.div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                Enregistrement...
              </>
            ) : (
              <>Enregistrer</>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
};

export default TaskForm;