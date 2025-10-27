// src/components/calendar/EventForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import AddressAutocomplete from '../common/AddressAutocomplete';
import RecurrenceForm from './RecurrenceForm';

const EventForm = ({ event = {}, selectedDate, onSave, onCancel }) => {
  // Déterminer la date de début et de fin par défaut
  const getInitialStartDate = () => {
    if (event.start_date) {
      return new Date(event.start_date);
    }
    
    if (selectedDate) {
      const date = new Date(selectedDate);
      date.setHours(9, 0, 0, 0); // 9:00 AM par défaut
      return date;
    }
    
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    return now;
  };
  
  const getInitialEndDate = () => {
    if (event.end_date) {
      return new Date(event.end_date);
    }
    
    const startDate = getInitialStartDate();
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);
    return endDate;
  };
  
  // État du formulaire
  const [formData, setFormData] = useState({
    title: event.title || '',
    description: event.description || '',
    start_date: getInitialStartDate(),
    end_date: getInitialEndDate(),
    all_day: event.all_day || false,
    location: event.location || '',
    category: event.category || 'meeting',
    priority: event.priority || 'medium',
    color: event.color || '#3B82F6', // Bleu
    // Champs de récurrence
    recurrence_type: event.recurrence_type || 'NONE',
    recurrence_interval: event.recurrence_interval || 1,
    recurrence_days: event.recurrence_days || '',
    recurrence_end_type: event.recurrence_end_type || 'NEVER',
    recurrence_end_date: event.recurrence_end_date || null,
    recurrence_count: event.recurrence_count || 10
  });
  
  const [errors, setErrors] = useState({});
  
  // Options de catégorie
  const categoryOptions = [
    { value: 'meeting', label: 'Réunion' },
    { value: 'deadline', label: 'Échéance' },
    { value: 'appointment', label: 'Rendez-vous' },
    { value: 'task', label: 'Tâche' },
    { value: 'reminder', label: 'Rappel' },
    { value: 'personal', label: 'Personnel' }
  ];

  // Options de priorité
  const priorityOptions = [
    { value: 'high', label: 'Haute', color: 'bg-rose-600' },
    { value: 'medium', label: 'Moyenne', color: 'bg-amber-600' },
    { value: 'low', label: 'Basse', color: 'bg-blue-600' }
  ];
  
  // Options de couleur
  const colorOptions = [
    { value: '#3B82F6', label: 'Bleu' },
    { value: '#10B981', label: 'Vert' },
    { value: '#F59E0B', label: 'Orange' },
    { value: '#EF4444', label: 'Rouge' },
    { value: '#8B5CF6', label: 'Violet' },
    { value: '#EC4899', label: 'Rose' }
  ];
  
  // Gérer les changements dans les champs du formulaire
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Pour les cases à cocher
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Effacer les erreurs lors de la saisie
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };
  
  // Gérer les changements de date
  const handleDateChange = (date, field) => {
    setFormData(prev => ({ ...prev, [field]: date }));

    // Effacer les erreurs lors de la saisie
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Gérer les changements de récurrence
  const handleRecurrenceChange = (recurrenceData) => {
    setFormData(prev => ({
      ...prev,
      ...recurrenceData
    }));
  };
  
  // Valider le formulaire avant soumission
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Le titre est requis';
    }
    
    if (!formData.start_date) {
      newErrors.start_date = 'La date de début est requise';
    }
    
    if (!formData.end_date) {
      newErrors.end_date = 'La date de fin est requise';
    }
    
    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      newErrors.end_date = 'La date de fin doit être postérieure à la date de début';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Soumettre le formulaire
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    onSave(formData);
  };

  return (
    <div className="w-full max-w-full">
      <h2 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-indigo-300">
        {event.id ? 'Modifier l\'événement' : 'Nouvel événement'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Titre */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
            Titre <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={`w-full bg-white text-gray-800 border ${
              errors.title ? 'border-rose-500' : 'border-gray-400'
            } rounded-lg px-4 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500`}
            placeholder="Ex: Réunion d'équipe"
          />
          {errors.title && (
            <p className="mt-1 text-xs text-rose-500">{errors.title}</p>
          )}
        </div>
        
        {/* Type d'événement et priorité */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-300 mb-1">
              Type d'événement
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {categoryOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Priorité
            </label>
            <div className="flex space-x-2">
              {priorityOptions.map(option => (
                <label 
                  key={option.value}
                  className={`flex-1 py-2 rounded-lg cursor-pointer text-center text-sm ${
                    formData.priority === option.value 
                      ? `${option.color} text-white`
                      : 'bg-white text-gray-800 hover:bg-gray-100'
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
        </div>
        
        {/* Date et heure */}
        <div>
          <div className="flex items-center mb-2">
            <label className="flex items-center text-sm font-medium text-gray-300">
              <input
                type="checkbox"
                name="all_day"
                checked={formData.all_day}
                onChange={handleInputChange}
                className="mr-2"
              />
              Événement sur toute la journée
            </label>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Début <span className="text-rose-500">*</span>
              </label>
              <DatePicker
                selected={formData.start_date}
                onChange={(date) => handleDateChange(date, 'start_date')}
                showTimeSelect={!formData.all_day}
                dateFormat={formData.all_day ? "dd/MM/yyyy" : "dd/MM/yyyy HH:mm"}
                timeFormat="HH:mm"
                timeIntervals={15}
                className={`w-full bg-white text-gray-800 border ${
                  errors.start_date ? 'border-rose-500' : 'border-gray-400'
                } rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
              {errors.start_date && (
                <p className="mt-1 text-xs text-rose-500">{errors.start_date}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Fin <span className="text-rose-500">*</span>
              </label>
              <DatePicker
                selected={formData.end_date}
                onChange={(date) => handleDateChange(date, 'end_date')}
                showTimeSelect={!formData.all_day}
                dateFormat={formData.all_day ? "dd/MM/yyyy" : "dd/MM/yyyy HH:mm"}
                timeFormat="HH:mm"
                timeIntervals={15}
                className={`w-full bg-white text-gray-800 border ${
                  errors.end_date ? 'border-rose-500' : 'border-gray-400'
                } rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
              {errors.end_date && (
                <p className="mt-1 text-xs text-rose-500">{errors.end_date}</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Lieu avec auto-complétion */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-300 mb-1">
            Lieu
          </label>
          <AddressAutocomplete
            value={formData.location}
            onChange={(value) => {
              setFormData(prev => ({ ...prev, location: value }));
            }}
            onSelect={(addressDetails) => {
              console.log('Adresse sélectionnée pour l\'événement:', addressDetails);
              setFormData(prev => ({
                ...prev,
                location: addressDetails.address
              }));
            }}
            placeholder="Ex: 10 rue de Rivoli, Paris ou Salle de réunion..."
          />
        </div>
        
        {/* Couleur */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Couleur
          </label>
          <div className="flex flex-wrap gap-3">
            {colorOptions.map(option => (
              <label 
                key={option.value}
                className={`cursor-pointer flex flex-col items-center`}
              >
                <div 
                  className={`w-8 h-8 rounded-full mb-1 border-2 ${
                    formData.color === option.value 
                      ? 'border-white' 
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: option.value }}
                />
                <input 
                  type="radio" 
                  name="color" 
                  value={option.value} 
                  checked={formData.color === option.value} 
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <span className="text-xs text-gray-300">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        
        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows="3"
            className="w-full bg-white text-gray-800 border border-gray-400 rounded-lg px-4 py-2 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Détails de l'événement..."
          />
        </div>

        {/* Récurrence */}
        <RecurrenceForm
          recurrenceData={{
            recurrence_type: formData.recurrence_type,
            recurrence_interval: formData.recurrence_interval,
            recurrence_days: formData.recurrence_days,
            recurrence_end_type: formData.recurrence_end_type,
            recurrence_end_date: formData.recurrence_end_date,
            recurrence_count: formData.recurrence_count
          }}
          onChange={handleRecurrenceChange}
        />

{/* Boutons d'action */}
<div className="flex justify-end space-x-3 pt-4">
          <motion.button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-white text-gray-900 border-2 border-gray-600 hover:bg-gray-100 hover:border-gray-700 font-semibold transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Annuler
          </motion.button>
          
          <motion.button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {event.id ? 'Mettre à jour' : 'Enregistrer'}
          </motion.button>
        </div>
      </form>
    </div>
  );
};

export default EventForm;