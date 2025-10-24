// src/components/revenues/RevenueForm.jsx
import React, { useState } from 'react';
import FormInput from '../common/FormInput';
import FormSelect from '../common/FormSelect';
import { FormButtons } from '../common/Button';

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
    { value: 'invoice', label: 'Facture', icon: '📄' },
    { value: 'recurring', label: 'Récurrent', icon: '🔄' },
    { value: 'other', label: 'Autre', icon: '📦' }
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
        <div className="relative">
          <FormInput
            label="Montant (€)"
            type="number"
            name="amount"
            value={formData.amount}
            onChange={handleInputChange}
            error={errors.amount}
            step="0.01"
            min="0"
            required
            variant="light"
            inputClassName="pl-10"
          />
          <span className="absolute left-3 top-[2.4rem] text-gray-600">
            €
          </span>
        </div>
        
        {/* Date */}
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

        {/* Description */}
        <FormInput
          label="Description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          error={errors.description}
          placeholder="Ex: Acompte projet site web"
          required
          variant="light"
        />
        
        {/* Projet associé */}
        <FormSelect
          label="Associer à un projet"
          name="project_id"
          value={formData.project_id}
          onChange={handleInputChange}
          options={projects.map(project => ({ value: project.id, label: project.name }))}
          placeholder="Aucun projet"
          variant="light"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Type */}
          <FormSelect
            label="Type"
            name="type"
            value={formData.type}
            onChange={handleInputChange}
            options={typeOptions}
            variant="light"
          />
          
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
        <FormButtons
          onCancel={onCancel}
          loading={submitting}
          submitLabel="Enregistrer"
          cancelLabel="Annuler"
          className="pt-4"
        />
      </form>
    </div>
  );
};

export default RevenueForm;