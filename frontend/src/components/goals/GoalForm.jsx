// src/components/goals/GoalForm.jsx
import React, { useState, useEffect } from 'react';
import { isAutoGoalCategory } from '../../utils/goalPace';
// Suppression de framer-motion pour éviter les conflits WebAssembly
// import { motion } from 'framer-motion';

const GoalForm = ({ goal, onSave, onCancel }) => {
  // S'assurer que goal est un objet (pas null ou undefined)
  const goalData = goal || {};

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
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    title: goalData.title || goalData.name || '',
    description: goalData.description || '',
    target_value: goalData.target_value || '',
    current_value: goalData.current_value || 0,
    category: goalData.category || 'productivity',
    period: goalData.period || 'monthly',
    start_date: formatDateForInput(goalData.start_date) || formatDateForInput(defaultStartDate),
    end_date: formatDateForInput(goalData.end_date) || formatDateForInput(defaultEndDate)
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

  // Options de catégorie. Les catégories "auto" sont calculées automatiquement depuis
  // les vraies données (pas de saisie de la valeur actuelle).
  const categoryOptions = [
    // Catégories métier (réalisé calculé automatiquement)
    { value: 'maintenance_signed', label: 'Contrats de maintenance', description: 'Contrats de maintenance signés sur la période', auto: true },
    { value: 'subscriptions', label: 'Abonnements', description: 'Abonnements actifs créés sur la période', auto: true },
    { value: 'new_clients', label: 'Nouveaux clients', description: 'Clients créés sur la période', auto: true },
    { value: 'quotes_sent', label: 'Devis envoyés', description: 'Devis envoyés sur la période', auto: true },
    { value: 'projects_signed', label: 'Projets / contrats', description: 'Projets créés sur la période', auto: true },
    { value: 'revenue_cashed', label: 'CA encaissé (€)', description: 'Revenus encaissés (payés) sur la période', auto: true },
    { value: 'prospects_contacted', label: 'Prospects contactés', description: 'Prospects passés en « Contacté » sur la période', auto: true },
    // Catégories manuelles (saisie de la valeur actuelle)
    { value: 'leads', label: 'Leads (manuel)', description: 'Objectifs liés à l\'acquisition de clients' },
    { value: 'revenue', label: 'Revenus (manuel)', description: 'Objectifs financiers et de chiffre d\'affaires' },
    { value: 'productivity', label: 'Productivité', description: 'Objectifs liés à l\'efficacité et à la performance' },
    { value: 'marketing', label: 'Marketing', description: 'Objectifs de visibilité et de communication' },
    { value: 'personal', label: 'Personnel', description: 'Objectifs de développement personnel' }
  ];

  // Options de période
  const periodOptions = [
    { value: 'weekly', label: 'Hebdomadaire', description: 'Objectif à atteindre sur une semaine' },
    { value: 'monthly', label: 'Mensuel', description: 'Objectif à atteindre sur un mois' },
    { value: 'quarterly', label: 'Trimestriel', description: 'Objectif à atteindre sur un trimestre' },
    { value: 'semiannual', label: 'Semestriel', description: 'Objectif à atteindre sur un semestre' },
    { value: 'yearly', label: 'Annuel', description: 'Objectif à atteindre sur une année' }
  ];

  const isAuto = isAutoGoalCategory(formData.category);
  
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
    if (period === 'weekly') {
      end = new Date(start);
      end.setDate(end.getDate() + 6); // semaine = 7 jours (début inclus)
    } else if (period === 'monthly') {
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // Dernier jour du mois
    } else if (period === 'quarterly') {
      end = new Date(start);
      end.setMonth(end.getMonth() + 3);
      end.setDate(end.getDate() - 1);
    } else if (period === 'semiannual') {
      end = new Date(start);
      end.setMonth(end.getMonth() + 6);
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
        {goalData.id ? 'Modifier l\'objectif' : 'Nouvel objectif'}
      </h2>
      
      <div className="space-y-6">
        {/* Titre de l'objectif (pour name) */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-text-secondary mb-1">
            Nom de l'objectif<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={`w-full bg-surface/50 text-text-primary border ${
              errors.title ? 'border-rose-500' : 'border-border'
            } rounded-lg px-4 py-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent break-words`}
            placeholder="Ex: Acquérir 5 nouveaux clients"
          />
          {errors.title && (
            <p className="mt-1 text-xs text-rose-500">
              {errors.title}
            </p>
          )}
        </div>
        
        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-text-secondary mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows="3"
            className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Décrivez votre objectif en quelques mots..."
          />
        </div>
        
        {/* Valeurs cible et actuelle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="target_value" className="block text-sm font-medium text-text-secondary mb-1">
              Valeur cible<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="number"
              id="target_value"
              name="target_value"
              value={formData.target_value}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 text-text-primary border ${
                errors.target_value ? 'border-rose-500' : 'border-border'
              } rounded-lg px-4 py-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
              placeholder="Ex: 5000"
              step="0.01"
              min="0"
            />
            <p className="mt-1 text-xs text-text-secondary">
              La valeur cible doit être supérieure à 0
            </p>
            {errors.target_value && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.target_value}
              </p>
            )}
          </div>
          
          {isAuto ? (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Valeur actuelle
              </label>
              <div className="w-full bg-surface-muted/50 text-text-muted border border-border rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-info-bg text-info-text">Auto</span>
                Calculée depuis les données réelles
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="current_value" className="block text-sm font-medium text-text-secondary mb-1">
                Valeur actuelle
              </label>
              <input
                type="number"
                id="current_value"
                name="current_value"
                value={formData.current_value}
                onChange={handleInputChange}
                className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Ex: 0"
                step="0.01"
                min="0"
              />
            </div>
          )}
        </div>
        
        {/* Catégorie */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Catégorie<span className="text-rose-500 ml-1">*</span>
          </label>
          <div className="grid grid-cols-1 gap-3">
            {categoryOptions.map(option => (
              <div
                key={option.value}
                className={`cursor-pointer p-4 rounded-lg border ${
                  formData.category === option.value
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'bg-surface/50 text-text-primary border-gray-300 hover:bg-surface-strong'
                }`}
                onClick={() => setFormData(prev => ({ ...prev, category: option.value }))}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium">{option.label}</span>
                  {option.auto && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      formData.category === option.value ? 'bg-white/20 text-white' : 'bg-info-bg text-info-text'
                    }`}>
                      Auto
                    </span>
                  )}
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
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Période<span className="text-rose-500 ml-1">*</span>
          </label>
          <div className="grid grid-cols-1 gap-3">
            {periodOptions.map(option => (
              <div
                key={option.value}
                className={`cursor-pointer p-4 rounded-lg border ${
                  formData.period === option.value
                    ? 'bg-amber-600 text-white border-amber-500'
                    : 'bg-surface/50 text-text-primary border-gray-300 hover:bg-surface-strong'
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
          <div>
            <label htmlFor="start_date" className="block text-sm font-medium text-text-secondary mb-1">
              Date de début<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="date"
              id="start_date"
              name="start_date"
              value={formData.start_date}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 text-text-primary border ${
                errors.start_date ? 'border-rose-500' : 'border-border'
              } rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
            {errors.start_date && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.start_date}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="end_date" className="block text-sm font-medium text-text-secondary mb-1">
              Date de fin<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="date"
              id="end_date"
              name="end_date"
              value={formData.end_date}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 text-text-primary border ${
                errors.end_date ? 'border-rose-500' : 'border-border'
              } rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
            {errors.end_date && (
              <p className="mt-1 text-xs text-rose-500">
                {errors.end_date}
              </p>
            )}
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="pt-6 flex justify-end space-x-4">
          <button
            type="button"
            className="px-5 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 shadow-md font-semibold transition-all"
            onClick={onCancel}
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className={`px-6 py-2 rounded-lg ${
              !formValid ?
              'bg-amber-400 text-gray-700 cursor-not-allowed opacity-60' :
              'bg-amber-600 hover:bg-amber-700 text-white'
            } font-medium shadow-md transition-all`}
            disabled={!formValid || submitting}
          >
            {submitting ? 'Enregistrement...' : goalData.id ? 'Mettre à jour' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoalForm;