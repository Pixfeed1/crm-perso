// src/components/leads/LeadForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const LeadForm = ({ lead = {}, onSave, onCancel }) => {
  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    name: lead.name || '',
    company: lead.company || '',
    type: lead.type || 'company',
    status: lead.status || 'nouveau',
    source: lead.source || '',
    notes: lead.notes || ''
  });
  
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Options de statut
  const statusOptions = [
    { value: 'nouveau', label: 'Nouveau' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'qualifié', label: 'Qualifié' },
    { value: 'négociation', label: 'Négociation' },
    { value: 'client', label: 'Client' },
    { value: 'perdu', label: 'Perdu' }
  ];
  
  // Options de source
  const sourceOptions = [
    { value: 'Site Web', label: 'Site Web' },
    { value: 'Référence', label: 'Référence' },
    { value: 'LinkedIn', label: 'LinkedIn' },
    { value: 'Email', label: 'Email' },
    { value: 'Téléphone', label: 'Téléphone' },
    { value: 'Contact direct', label: 'Contact direct' },
    { value: 'Autre', label: 'Autre' }
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
    
    if (!formData.name.trim()) {
      newErrors.name = 'Le nom est requis';
    }
    
    if (formData.type === 'company' && !formData.company.trim()) {
      newErrors.company = 'Le nom de l\'entreprise est requis';
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
      <h2 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
        {lead.id ? 'Modifier le lead' : 'Nouveau lead'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Type de lead (entreprise ou particulier) */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">Type de lead</label>
          <div className="flex space-x-4">
            <label className={`flex items-center px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              formData.type === 'company' 
                ? 'bg-indigo-600/40 border-indigo-500' 
                : 'bg-gray-800/40 border-gray-700 hover:bg-gray-700/30'
            } border`}>
              <input 
                type="radio" 
                name="type" 
                value="company" 
                checked={formData.type === 'company'} 
                onChange={handleInputChange}
                className="sr-only"
              />
              <span className="text-lg mr-2">🏢</span>
              <span>Entreprise</span>
            </label>
            
            <label className={`flex items-center px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              formData.type === 'individual' 
                ? 'bg-purple-600/40 border-purple-500' 
                : 'bg-gray-800/40 border-gray-700 hover:bg-gray-700/30'
            } border`}>
              <input 
                type="radio" 
                name="type" 
                value="individual" 
                checked={formData.type === 'individual'} 
                onChange={handleInputChange}
                className="sr-only"
              />
              <span className="text-lg mr-2">👤</span>
              <span>Particulier</span>
            </label>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Nom */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
              {formData.type === 'company' ? 'Contact principal' : 'Nom'}
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`w-full bg-gray-800/50 border ${
                errors.name ? 'border-rose-500' : 'border-gray-700'
              } rounded-lg px-4 py-2 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
              placeholder="John Doe"
            />
            {errors.name && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 text-xs text-rose-500"
              >
                {errors.name}
              </motion.p>
            )}
          </div>
          
          {/* Entreprise (conditionnellement affiché) */}
          {formData.type === 'company' && (
            <div>
              <label htmlFor="company" className="block text-sm font-medium text-gray-300 mb-1">
                Entreprise<span className="text-rose-500 ml-1">*</span>
              </label>
              <input
                type="text"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleInputChange}
                className={`w-full bg-gray-800/50 border ${
                  errors.company ? 'border-rose-500' : 'border-gray-700'
                } rounded-lg px-4 py-2 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                placeholder="Acme Inc."
              />
              {errors.company && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1 text-xs text-rose-500"
                >
                  {errors.company}
                </motion.p>
              )}
            </div>
          )}
          
          {/* Statut */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-300 mb-1">
              Statut
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {/* Source */}
          <div>
            <label htmlFor="source" className="block text-sm font-medium text-gray-300 mb-1">
              Source
            </label>
            <select
              id="source"
              name="source"
              value={formData.source}
              onChange={handleInputChange}
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Sélectionner une source</option>
              {sourceOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={4}
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Informations supplémentaires sur ce lead..."
          />
        </div>
        
        {/* Boutons d'action */}
        <div className="flex justify-end space-x-3 pt-4">
          <motion.button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
          >
            Annuler
          </motion.button>
          
          <motion.button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center"
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

export default LeadForm;