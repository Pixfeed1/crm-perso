// src/components/leads/InteractionForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiPhone, FiMail, FiUsers, FiFileText } from 'react-icons/fi';
import TemplateSelector from '../common/TemplateSelector';
import { templateCategories } from '../../services/templates';

const InteractionForm = ({ interaction = {}, contacts = [], onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    type: interaction.type || 'call',
    contact_id: interaction.contact_id || '',
    date: interaction.date || new Date().toISOString().slice(0, 16),
    description: interaction.description || '',
    notes: interaction.notes || ''
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Configuration des types d'interaction
  const interactionTypes = [
    { value: 'call', label: 'Appel téléphonique', icon: <FiPhone />, color: 'blue' },
    { value: 'email', label: 'Email', icon: <FiMail />, color: 'purple' },
    { value: 'meeting', label: 'Réunion', icon: <FiUsers />, color: 'emerald' },
    { value: 'note', label: 'Note', icon: <FiFileText />, color: 'amber' }
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

    if (!formData.type) {
      newErrors.type = 'Le type est requis';
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
      await onSave({
        ...formData,
        contact_id: formData.contact_id || null
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-muted/40 rounded-lg p-4 sm:p-5">
      <h4 className="text-base sm:text-lg font-medium text-indigo-300 mb-3 sm:mb-4">
        {interaction.id ? 'Modifier l\'interaction' : 'Nouvelle interaction'}
      </h4>

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        {/* Type d'interaction */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-2">
            Type d'interaction<span className="text-rose-500 ml-1">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {interactionTypes.map(type => (
              <label
                key={type.value}
                className={`flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
                  formData.type === type.value
                    ? `bg-${type.color}-600/40 border-${type.color}-500`
                    : 'bg-surface/40 border-border hover:bg-surface-strong/30'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={type.value}
                  checked={formData.type === type.value}
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <span className="text-sm sm:text-base mr-2 text-text-primary">{type.icon}</span>
                <span className="text-xs sm:text-sm text-text-primary">{type.label}</span>
              </label>
            ))}
          </div>
          {errors.type && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.type}
            </motion.p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Date et heure */}
          <div>
            <label htmlFor="interaction-date" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Date et heure<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="datetime-local"
              id="interaction-date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 border ${
                errors.date ? 'border-rose-500' : 'border-border'
              } rounded-lg px-3 py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
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

          {/* Contact associé */}
          <div>
            <label htmlFor="interaction-contact" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Contact associé
            </label>
            <select
              id="interaction-contact"
              name="contact_id"
              value={formData.contact_id}
              onChange={handleInputChange}
              className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Aucun contact spécifique</option>
              {contacts.map(contact => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="interaction-description" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            Description<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="text"
            id="interaction-description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            className={`w-full bg-surface/50 border ${
              errors.description ? 'border-rose-500' : 'border-border'
            } rounded-lg px-3 py-2 text-text-primary placeholder-text-muted text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
            placeholder="Ex: Appel pour discuter du projet"
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

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="interaction-notes" className="block text-xs sm:text-sm font-medium text-text-secondary">
              Notes détaillées
            </label>
            <TemplateSelector
              category={templateCategories.INTERACTION}
              currentValue={formData.notes}
              onSelect={(content) => setFormData(prev => ({ ...prev, notes: content }))}
              buttonText="Template"
            />
          </div>
          <textarea
            id="interaction-notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            placeholder="Points discutés, actions à prendre, etc."
          />
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
          <motion.button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium transition-all text-sm sm:text-base"
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

export default InteractionForm;
