// src/components/projects/InterventionForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiRefreshCw, FiDownload, FiShield, FiTool, FiHelpCircle } from 'react-icons/fi';

const InterventionForm = ({ intervention = {}, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    title: intervention.title || '',
    description: intervention.description || '',
    type: intervention.type || 'maintenance',
    status: intervention.status || 'planned',
    priority: intervention.priority || 'normal',
    scheduled_date: intervention.scheduled_date ? new Date(intervention.scheduled_date).toISOString().slice(0, 16) : '',
    duration_minutes: intervention.duration_minutes || '',
    technician: intervention.technician || '',
    notes: intervention.notes || ''
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Options de type d'intervention
  const typeOptions = [
    { value: 'update', label: 'Mise à jour', icon: <FiRefreshCw /> },
    { value: 'backup', label: 'Sauvegarde', icon: <FiDownload /> },
    { value: 'security', label: 'Sécurité', icon: <FiShield /> },
    { value: 'maintenance', label: 'Maintenance', icon: <FiTool /> },
    { value: 'support', label: 'Support', icon: <FiHelpCircle /> },
    { value: 'other', label: 'Autre', icon: <FiTool /> }
  ];

  // Options de priorité
  const priorityOptions = [
    { value: 'low', label: 'Basse', color: 'bg-border-strong text-text-primary' },
    { value: 'normal', label: 'Normale', color: 'bg-blue-600 text-blue-100' },
    { value: 'high', label: 'Haute', color: 'bg-amber-600 text-amber-100' },
    { value: 'urgent', label: 'Urgente', color: 'bg-rose-600 text-rose-100' }
  ];

  // Options de statut
  const statusOptions = [
    { value: 'planned', label: 'Planifiée' },
    { value: 'in_progress', label: 'En cours' },
    { value: 'completed', label: 'Terminée' },
    { value: 'cancelled', label: 'Annulée' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.title.trim()) {
      newErrors.title = 'Le titre est requis';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);

      // Préparer les données
      const dataToSend = {
        ...formData,
        duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes) : null,
        scheduled_date: formData.scheduled_date || null
      };

      await onSave(dataToSend);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-muted/40 rounded-lg p-5 w-full max-w-full">
      <h4 className="text-lg font-medium text-purple-300 mb-4">
        {intervention.id ? 'Modifier l\'intervention' : 'Nouvelle intervention'}
      </h4>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Titre */}
        <div>
          <label htmlFor="intervention-title" className="block text-sm font-medium text-text-secondary mb-1">
            Titre<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="text"
            id="intervention-title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={`w-full bg-surface/50 text-text-primary border ${
              errors.title ? 'border-rose-500' : 'border-border'
            } rounded-lg px-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            placeholder="Ex: Mise à jour CMS / plugin sécurité"
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

        {/* Type d'intervention */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Type d'intervention
          </label>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {typeOptions.map(option => (
              <label
                key={option.value}
                className={`py-2 px-3 rounded-lg cursor-pointer transition-colors text-center text-sm flex flex-col items-center gap-1 ${
                  formData.type === option.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-surface/50 text-text-muted hover:bg-surface-strong/50'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={option.value}
                  checked={formData.type === option.value}
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <span className="text-lg">{option.icon}</span>
                <span className="text-xs">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="intervention-description" className="block text-sm font-medium text-text-secondary mb-1">
            Description
          </label>
          <textarea
            id="intervention-description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={2}
            className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Détails de l'intervention..."
          />
        </div>

        {/* Date et durée */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="scheduled-date" className="block text-sm font-medium text-text-secondary mb-1">
              Date planifiée
            </label>
            <input
              type="datetime-local"
              id="scheduled-date"
              name="scheduled_date"
              value={formData.scheduled_date}
              onChange={handleInputChange}
              className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-text-secondary mb-1">
              Durée (minutes)
            </label>
            <input
              type="number"
              id="duration"
              name="duration_minutes"
              value={formData.duration_minutes}
              onChange={handleInputChange}
              min="0"
              step="5"
              className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="30"
            />
          </div>
        </div>

        {/* Statut et Priorité */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-text-secondary mb-1">
              Statut
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Priorité
            </label>
            <div className="grid grid-cols-4 gap-2">
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
        </div>

        {/* Technicien */}
        <div>
          <label htmlFor="technician" className="block text-sm font-medium text-text-secondary mb-1">
            Technicien
          </label>
          <input
            type="text"
            id="technician"
            name="technician"
            value={formData.technician}
            onChange={handleInputChange}
            className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Nom du technicien"
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-text-secondary mb-1">
            Notes internes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={2}
            className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Notes internes (non visibles dans le rapport client)..."
          />
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

export default InterventionForm;
