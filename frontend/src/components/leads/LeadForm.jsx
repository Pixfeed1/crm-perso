// src/components/leads/LeadForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiBriefcase, FiUser } from 'react-icons/fi';
import CompanyAutocomplete from '../common/CompanyAutocomplete';
import TemplateSelector from '../common/TemplateSelector';
import { templateCategories } from '../../services/templates';

const LeadForm = ({ lead = {}, onSave, onCancel }) => {
  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    name: lead.name || '',
    company: lead.company || '',
    type: lead.type || 'company',
    status: lead.status || 'nouveau',
    source: lead.source || '',
    facebook_url: lead.facebook_url || '',
    instagram_url: lead.instagram_url || '',
    notes: lead.notes || ''
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Options de statut
  const statusOptions = [
    { value: 'nouveau', label: 'Nouveau' },
    { value: 'contacte', label: 'Contacté' },
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
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
        {lead.id ? 'Modifier le lead' : 'Nouveau lead'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Type de lead (entreprise ou particulier) */}
        <div className="mb-4 sm:mb-6">
          <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-2">Type de lead</label>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <label className={`flex items-center px-3 py-2 sm:px-4 sm:py-2 rounded-lg cursor-pointer transition-colors ${
              formData.type === 'company'
                ? 'bg-accent/40 border-indigo-500'
                : 'bg-surface/40 border-border hover:bg-surface-strong/30'
            } border`}>
              <input
                type="radio"
                name="type"
                value="company"
                checked={formData.type === 'company'}
                onChange={handleInputChange}
                className="sr-only"
              />
              <FiBriefcase className="text-base sm:text-lg mr-2 text-text-primary" />
              <span className="text-sm sm:text-base text-text-primary">Entreprise</span>
            </label>

            <label className={`flex items-center px-3 py-2 sm:px-4 sm:py-2 rounded-lg cursor-pointer transition-colors ${
              formData.type === 'individual'
                ? 'bg-purple-600/40 border-purple-500'
                : 'bg-surface/40 border-border hover:bg-surface-strong/30'
            } border`}>
              <input
                type="radio"
                name="type"
                value="individual"
                checked={formData.type === 'individual'}
                onChange={handleInputChange}
                className="sr-only"
              />
              <FiUser className="text-base sm:text-lg mr-2 text-text-primary" />
              <span className="text-sm sm:text-base text-text-primary">Particulier</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Nom */}
          <div>
            <label htmlFor="name" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              {formData.type === 'company' ? 'Contact principal' : 'Nom'}
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 border ${
                errors.name ? 'border-rose-500' : 'border-border'
              } rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-text-primary placeholder-text-muted text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
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

          {/* Entreprise (conditionnellement affiché avec auto-complétion) */}
          {formData.type === 'company' && (
            <div>
              <label htmlFor="company" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
                Entreprise<span className="text-rose-500 ml-1">*</span>
              </label>
              <CompanyAutocomplete
                value={formData.company}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, company: value }));
                  if (errors.company) {
                    setErrors(prev => ({ ...prev, company: null }));
                  }
                }}
                onSelect={(companyDetails) => {
                  // Remplir automatiquement les champs avec les données de l'entreprise
                  console.log('Entreprise sélectionnée:', companyDetails);
                  setFormData(prev => ({
                    ...prev,
                    company: companyDetails.name,
                    // On pourrait ajouter d'autres champs si le formulaire les supporte
                    notes: prev.notes
                      ? `${prev.notes}\n\nSIREN: ${companyDetails.siren}\nForme juridique: ${companyDetails.legalForm}\nActivité: ${companyDetails.activityLabel}\nEffectifs: ${companyDetails.employees}${companyDetails.address ? '\nAdresse: ' + companyDetails.address : ''}`
                      : `SIREN: ${companyDetails.siren}\nForme juridique: ${companyDetails.legalForm}\nActivité: ${companyDetails.activityLabel}\nEffectifs: ${companyDetails.employees}${companyDetails.address ? '\nAdresse: ' + companyDetails.address : ''}`
                  }));
                }}
                placeholder="Rechercher une entreprise (nom, SIREN)..."
                error={errors.company}
              />
            </div>
          )}

          {/* Statut */}
          <div>
            <label htmlFor="status" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Statut
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            <label htmlFor="source" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Source
            </label>
            <select
              id="source"
              name="source"
              value={formData.source}
              onChange={handleInputChange}
              className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Sélectionner une source</option>
              {sourceOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Réseaux sociaux (outreach multi-canal) */}
          <div>
            <label htmlFor="facebook_url" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Facebook (URL ou pseudo)
            </label>
            <input
              type="text"
              id="facebook_url"
              name="facebook_url"
              value={formData.facebook_url}
              onChange={handleInputChange}
              placeholder="https://facebook.com/… ou pseudo"
              className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="instagram_url" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Instagram (URL ou pseudo)
            </label>
            <input
              type="text"
              id="instagram_url"
              name="instagram_url"
              value={formData.instagram_url}
              onChange={handleInputChange}
              placeholder="https://instagram.com/… ou @pseudo"
              className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="notes" className="block text-xs sm:text-sm font-medium text-text-secondary">
              Notes
            </label>
            <TemplateSelector
              category={templateCategories.LEAD}
              currentValue={formData.notes}
              onSelect={(content) => setFormData(prev => ({ ...prev, notes: content }))}
              buttonText="Template"
            />
          </div>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={4}
            className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 sm:px-4 sm:py-2 text-text-primary placeholder-text-muted text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            placeholder="Informations supplémentaires sur ce lead..."
          />
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2 sm:pt-4">
          <motion.button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium text-sm sm:text-base transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
          >
            Annuler
          </motion.button>

          <motion.button
            type="submit"
            className="px-4 py-2 rounded-lg bg-accent hover:bg-indigo-700 text-white font-medium flex items-center justify-center text-sm sm:text-base"
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
