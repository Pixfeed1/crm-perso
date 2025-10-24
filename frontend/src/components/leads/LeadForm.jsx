// src/components/leads/LeadForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import FormInput from '../common/FormInput';
import FormSelect from '../common/FormSelect';
import FormTextarea from '../common/FormTextarea';
import { FormButtons } from '../common/Button';

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
                aria-label="Type entreprise"
              />
              <span className="text-lg mr-2" aria-hidden="true">🏢</span>
              <span className="text-white">Entreprise</span>
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
                aria-label="Type particulier"
              />
              <span className="text-lg mr-2" aria-hidden="true">👤</span>
              <span className="text-white">Particulier</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Nom */}
          <FormInput
            label={formData.type === 'company' ? 'Contact principal' : 'Nom'}
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            error={errors.name}
            placeholder="John Doe"
            required
          />

          {/* Entreprise (conditionnellement affiché) */}
          {formData.type === 'company' && (
            <FormInput
              label="Entreprise"
              name="company"
              value={formData.company}
              onChange={handleInputChange}
              error={errors.company}
              placeholder="Acme Inc."
              required
            />
          )}

          {/* Statut */}
          <FormSelect
            label="Statut"
            name="status"
            value={formData.status}
            onChange={handleInputChange}
            options={statusOptions}
          />

          {/* Source */}
          <FormSelect
            label="Source"
            name="source"
            value={formData.source}
            onChange={handleInputChange}
            options={sourceOptions}
            placeholder="Sélectionner une source"
          />
        </div>

        {/* Notes */}
        <FormTextarea
          label="Notes"
          name="notes"
          value={formData.notes}
          onChange={handleInputChange}
          rows={4}
          placeholder="Informations supplémentaires sur ce lead..."
        />

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

export default LeadForm;
