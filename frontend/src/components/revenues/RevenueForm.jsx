// src/components/revenues/RevenueForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RevenueForm = ({ revenue = {}, onSave, onCancel, projects }) => {
  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    amount: revenue.amount || 0,
    date: revenue.date || new Date().toISOString().split('T')[0],
    description: revenue.description || '',
    project_id: revenue.project_id || '',
    type: revenue.type || 'invoice',
    status: revenue.status || 'pending'
  });
  
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Options de type
  const typeOptions = [
    { value: 'invoice', label: 'Facture' },
    { value: 'recurring', label: 'Récurrent' },
    { value: 'other', label: 'Autre' }
  ];
  
  // Options de statut
  const statusOptions = [
    { value: 'paid', label: 'Payé', color: 'bg-green-600' },
    { value: 'pending', label: 'En attente', color: 'bg-amber-600' },
    { value: 'planned', label: 'Planifié', color: 'bg-blue-600' }
  ];
  
  // Mise à jour des champs du formulaire
  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    // Conversion des valeurs numériques
    const parsedValue = type === 'number' ? parseFloat(value) : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: parsedValue
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
    
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Le montant doit être supérieur à 0';
    }
    
    if (!formData.date) {
      newErrors.date = 'La date est requise';
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'La description est requise';
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
    <div>
      <h2 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 to-teal-300">
        {revenue.id ? 'Modifier le revenu' : 'Nouveau revenu'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Montant */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1">
            Montant (€)<span className="text-rose-500 ml-1">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              className={`w-full bg-white text-gray-900 border ${
                errors.amount ? 'border-rose-500' : 'border-gray-400'
              } rounded-lg px-4 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
              style={{ color: '#111827' }}
            />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">
              €
            </span>
          </div>
          {errors.amount && (
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.amount}
            </motion.p>
          )}
        </div>
        
        {/* Date */}
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-300 mb-1">
            Date<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="date"
            id="date"
            name="date"
            value={formData.date}
            onChange={handleInputChange}
            className={`w-full bg-white text-gray-900 border ${
              errors.date ? 'border-rose-500' : 'border-gray-400'
            } rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
            style={{ color: '#111827' }}
          />
          {errors.date && (
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.date}
            </motion.p>
          )}
        </div>
        
        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
            Description<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="text"
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className={`w-full bg-white text-gray-900 border ${
              errors.description ? 'border-rose-500' : 'border-gray-400'
            } rounded-lg px-4 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent`}
            placeholder="Ex: Acompte projet site web"
            style={{ color: '#111827' }}
          />
          {errors.description && (
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.description}
            </motion.p>
          )}
        </div>
        
        {/* Projet associé */}
        <div>
          <label htmlFor="project_id" className="block text-sm font-medium text-gray-300 mb-1">
            Associer à un projet
          </label>
          <select
            id="project_id"
            name="project_id"
            value={formData.project_id}
            onChange={handleInputChange}
            className="w-full bg-white text-gray-900 border border-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            style={{ color: '#111827' }}
          >
            <option value="">Aucun projet</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Type */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-1">
              Type
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              className="w-full bg-white text-gray-900 border border-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              style={{ color: '#111827' }}
            >
              {typeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.icon} {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Statut
            </label>
            <div className="flex space-x-2">
              {statusOptions.map(option => (
                <label 
                  key={option.value}
                  className={`flex-1 py-2 rounded-lg cursor-pointer text-center text-sm ${
                    formData.status === option.value 
                      ? `${option.color} text-white`
                      : 'bg-white/90 text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="status" 
                    value={option.value} 
                    checked={formData.status === option.value} 
                    onChange={handleInputChange}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        
        {/* Boutons d'action */}
        <div className="flex justify-end space-x-3 pt-4">
          <motion.button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border-2 border-gray-600 bg-white text-gray-900 hover:bg-gray-100 hover:border-gray-700 font-semibold transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
          >
            Annuler
          </motion.button>
          
          <motion.button
            type="submit"
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium flex items-center"
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

export default RevenueForm;