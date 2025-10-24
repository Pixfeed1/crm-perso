// src/components/goals/GoalForm.jsx
import React, { useState, useEffect } from 'react';
import FormInput from '../common/FormInput';
import FormTextarea from '../common/FormTextarea';
import { FormButtons } from '../common/Button';

const GoalForm = ({ goal = {}, onSave, onCancel }) => {
  const defaultStartDate = new Date();
  let defaultEndDate;
  
  // Définir une date de fin par défaut (fin du mois en cours)
  if (defaultStartDate) {
    defaultEndDate = new Date(defaultStartDate);
    defaultEndDate.setMonth(defaultEndDate.getMonth() + 1);
    defaultEndDate.setDate(0); // Dernier jour du mois
  }
  
  // Formatage des dates pour l'input date
  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  
  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    title: goal.title || goal.name || '',
    description: goal.description || '',
    target_value: goal.target_value || '',
    current_value: goal.current_value || 0,
    category: goal.category || 'productivity',
    period: goal.period || 'monthly',
    start_date: goal.start_date || formatDateForInput(defaultStartDate),
    end_date: goal.end_date || formatDateForInput(defaultEndDate)
  });
  
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formValid, setFormValid] = useState(false);

  // Vérifier la validité du formulaire à chaque modification
  useEffect(() => {
    // Vérifier si les champs obligatoires sont remplis
    const isValid = 
      formData.title.trim() !== '' && 
      formData.target_value > 0 &&
      formData.category.trim() !== '' &&
      formData.period.trim() !== '' &&
      formData.start_date !== '' &&
      formData.end_date !== '';
    
    setFormValid(isValid);
  }, [formData]);

  // Options de catégorie
  const categoryOptions = [
    { value: 'leads', label: 'Leads', icon: '👥', description: 'Objectifs liés à l\'acquisition de clients' },
    { value: 'revenue', label: 'Revenus', icon: '💰', description: 'Objectifs financiers et de chiffre d\'affaires' },
    { value: 'productivity', label: 'Productivité', icon: '⚙️', description: 'Objectifs liés à l\'efficacité et à la performance' },
    { value: 'marketing', label: 'Marketing', icon: '📢', description: 'Objectifs de visibilité et de communication' },
    { value: 'personal', label: 'Personnel', icon: '🌱', description: 'Objectifs de développement personnel' }
  ];
  
  // Options de période
  const periodOptions = [
    { value: 'monthly', label: 'Mensuel', description: 'Objectif à atteindre sur un mois' },
    { value: 'quarterly', label: 'Trimestriel', description: 'Objectif à atteindre sur un trimestre' },
    { value: 'yearly', label: 'Annuel', description: 'Objectif à atteindre sur une année' }
  ];
  
  // Mise à jour des champs du formulaire
  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    // Conversion des valeurs numériques
    let parsedValue = value;
    if (type === 'number') {
      parsedValue = value === '' ? '' : parseFloat(value);
    }
    
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
  
  // Gestion de la période
  const handlePeriodChange = (period) => {
    const start = new Date(formData.start_date);
    let end;
    
    // Ajuster la date de fin en fonction de la période
    if (period === 'monthly') {
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // Dernier jour du mois
    } else if (period === 'quarterly') {
      end = new Date(start);
      end.setMonth(end.getMonth() + 3);
      end.setDate(end.getDate() - 1);
    } else if (period === 'yearly') {
      end = new Date(start);
      end.setFullYear(end.getFullYear() + 1);
      end.setDate(end.getDate() - 1);
    }
    
    setFormData(prev => ({
      ...prev,
      period,
      end_date: formatDateForInput(end)
    }));
  };
  
  // Validation du formulaire
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Le nom de l\'objectif est requis';
    }
    
    if (!formData.target_value || formData.target_value <= 0) {
      newErrors.target_value = 'La valeur cible doit être supérieure à 0';
    }

    if (!formData.category) {
      newErrors.category = 'La catégorie est requise';
    }

    if (!formData.period) {
      newErrors.period = 'La période est requise';
    }
    
    if (!formData.start_date) {
      newErrors.start_date = 'La date de début est requise';
    }
    
    if (!formData.end_date) {
      newErrors.end_date = 'La date de fin est requise';
    } else if (new Date(formData.end_date) <= new Date(formData.start_date)) {
      newErrors.end_date = 'La date de fin doit être postérieure à la date de début';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Soumission du formulaire
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setSubmitting(true);
      // Soumettre les données sans ajouter 'nom'
      await onSave(formData);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-300">
        {goal.id ? 'Modifier l\'objectif' : 'Nouvel objectif'}
      </h2>
      
      <div className="space-y-6">
        {/* Titre de l'objectif (pour name) */}
        <FormInput
          label="Nom de l'objectif"
          name="title"
          value={formData.title}
          onChange={handleInputChange}
          error={errors.title}
          placeholder="Ex: Acquérir 5 nouveaux clients"
          required
          variant="light"
        />
        
        {/* Description */}
        <FormTextarea
          label="Description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={3}
          placeholder="Décrivez votre objectif en quelques mots..."
          variant="light"
        />
        
        {/* Valeurs cible et actuelle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FormInput
              label="Valeur cible"
              type="number"
              name="target_value"
              value={formData.target_value}
              onChange={handleInputChange}
              error={errors.target_value}
              placeholder="Ex: 5000"
              step="0.01"
              min="0"
              required
              variant="light"
            />
            <p className="mt-1 text-xs text-gray-300">
              La valeur cible doit être supérieure à 0
            </p>
          </div>

          <FormInput
            label="Valeur actuelle"
            type="number"
            name="current_value"
            value={formData.current_value}
            onChange={handleInputChange}
            placeholder="Ex: 0"
            step="0.01"
            min="0"
            variant="light"
          />
        </div>
        
        {/* Catégorie */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Catégorie<span className="text-rose-500 ml-1">*</span>
          </label>
          <div className="grid grid-cols-1 gap-3">
            {categoryOptions.map(option => (
              <div
                key={option.value}
                className={`cursor-pointer p-4 rounded-lg border ${
                  formData.category === option.value
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100'
                }`}
                onClick={() => setFormData(prev => ({ ...prev, category: option.value }))}
              >
                <div className="flex items-center mb-1">
                  <span className="text-xl mr-2">{option.icon}</span>
                  <span className="font-medium">{option.label}</span>
                </div>
                <div className="text-sm">
                  {option.description}
                </div>
              </div>
            ))}
          </div>
          {errors.category && (
            <p className="mt-1 text-xs text-rose-500">
              {errors.category}
            </p>
          )}
        </div>
        
        {/* Période */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Période<span className="text-rose-500 ml-1">*</span>
          </label>
          <div className="grid grid-cols-1 gap-3">
            {periodOptions.map(option => (
              <div
                key={option.value}
                className={`cursor-pointer p-4 rounded-lg border ${
                  formData.period === option.value
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100'
                }`}
                onClick={() => handlePeriodChange(option.value)}
              >
                <div className="font-medium mb-1">{option.label}</div>
                <div className="text-sm">
                  {option.description}
                </div>
              </div>
            ))}
          </div>
          {errors.period && (
            <p className="mt-1 text-xs text-rose-500">
              {errors.period}
            </p>
          )}
        </div>
        
        {/* Dates de début et de fin */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Date de début"
            type="date"
            name="start_date"
            value={formData.start_date}
            onChange={handleInputChange}
            error={errors.start_date}
            required
            variant="light"
          />

          <FormInput
            label="Date de fin"
            type="date"
            name="end_date"
            value={formData.end_date}
            onChange={handleInputChange}
            error={errors.end_date}
            required
            variant="light"
          />
        </div>

        {/* Boutons d'action */}
        <div>
          <FormButtons
            onCancel={onCancel}
            loading={submitting}
            submitLabel={goal.id ? 'Mettre à jour' : 'Enregistrer'}
            cancelLabel="Annuler"
            className="pt-6"
            disabled={!formValid}
          />
        </div>
      </div>
    </div>
  );
};

export default GoalForm;