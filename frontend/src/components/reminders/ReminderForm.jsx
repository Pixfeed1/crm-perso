// src/components/reminders/ReminderForm.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { leadsAPI, projectsAPI, goalsAPI } from '../../services/api';

// Demain 9h, au format attendu par <input type="datetime-local">. Fonction pure,
// au niveau module pour être disponible dès l'initialisation de l'état.
const getDefaultDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.toISOString().slice(0, 16);
};

const ReminderForm = ({ onSave, onCancel }) => {
  // Date par défaut posée DANS l'état initial. L'ancien effet « au montage » lisait
  // formData sans le déclarer : y ajouter la dépendance aurait fait revenir la date
  // par défaut dès que l'utilisateur vidait le champ. L'intention (initialiser une
  // seule fois) s'exprime sans effet du tout.
  const [formData, setFormData] = useState(() => ({
    entity_type: 'lead',
    entity_id: '',
    title: '',
    description: '',
    due_date: getDefaultDate(),
    priority: 'medium'
  }));

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [entities, setEntities] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Charger les entités selon le type sélectionné
  useEffect(() => {
    const fetchEntities = async () => {
      setLoadingEntities(true);
      try {
        let data = [];
        if (formData.entity_type === 'lead') {
          data = await leadsAPI.getAll();
        } else if (formData.entity_type === 'project') {
          data = await projectsAPI.getAll();
        } else if (formData.entity_type === 'goal') {
          data = await goalsAPI.getAll();
        }
        setEntities(data);
      } catch (error) {
        console.error('Erreur lors du chargement des entités:', error);
        setEntities([]);
      } finally {
        setLoadingEntities(false);
      }
    };

    fetchEntities();
  }, [formData.entity_type]);

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

    if (!formData.entity_type) {
      newErrors.entity_type = 'Le type est requis';
    }

    if (!formData.entity_id) {
      newErrors.entity_id = 'L\'entité est requise';
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Le titre est requis';
    }

    if (!formData.due_date) {
      newErrors.due_date = 'La date est requise';
    } else {
      const dueDate = new Date(formData.due_date);
      if (isNaN(dueDate.getTime())) {
        newErrors.due_date = 'Format de date invalide';
      }
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
        entity_id: parseInt(formData.entity_id)
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Générer une date par défaut (demain à 9h)


  // Obtenir le nom de l'entité
  const getEntityName = (entity) => {
    return entity.name || entity.title || entity.description || `#${entity.id}`;
  };

  return (
    <div className="bg-surface-muted/40 rounded-lg p-4 sm:p-5">
      <h4 className="text-base sm:text-lg font-medium text-indigo-300 mb-3 sm:mb-4">
        Nouveau rappel
      </h4>

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Type d'entité */}
          <div>
            <label htmlFor="entity_type" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Type<span className="text-rose-500 ml-1">*</span>
            </label>
            <select
              id="entity_type"
              name="entity_type"
              value={formData.entity_type}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 border ${
                errors.entity_type ? 'border-rose-500' : 'border-border'
              } rounded-lg px-3 py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
            >
              <option value="lead">Lead</option>
              <option value="project">Projet</option>
              <option value="goal">Objectif</option>
            </select>
            {errors.entity_type && (
              <p className="mt-1 text-xs text-rose-500">{errors.entity_type}</p>
            )}
          </div>

          {/* Entité */}
          <div>
            <label htmlFor="entity_id" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              {formData.entity_type === 'lead' ? 'Lead' : formData.entity_type === 'project' ? 'Projet' : 'Objectif'}
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <select
              id="entity_id"
              name="entity_id"
              value={formData.entity_id}
              onChange={handleInputChange}
              disabled={loadingEntities}
              className={`w-full bg-surface/50 border ${
                errors.entity_id ? 'border-rose-500' : 'border-border'
              } rounded-lg px-3 py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50`}
            >
              <option value="">
                {loadingEntities ? 'Chargement...' : 'Sélectionner'}
              </option>
              {entities.map(entity => (
                <option key={entity.id} value={entity.id}>
                  {getEntityName(entity)}
                </option>
              ))}
            </select>
            {errors.entity_id && (
              <p className="mt-1 text-xs text-rose-500">{errors.entity_id}</p>
            )}
          </div>
        </div>

        {/* Titre */}
        <div>
          <label htmlFor="title" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            Titre<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className={`w-full bg-surface/50 border ${
              errors.title ? 'border-rose-500' : 'border-border'
            } rounded-lg px-3 py-2 text-text-primary placeholder-text-muted text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
            placeholder="Ex: Relancer le client"
          />
          {errors.title && (
            <p className="mt-1 text-xs text-rose-500">{errors.title}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={3}
            className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            placeholder="Détails optionnels..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Date et heure */}
          <div>
            <label htmlFor="due_date" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Date et heure<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="datetime-local"
              id="due_date"
              name="due_date"
              value={formData.due_date}
              onChange={handleInputChange}
              className={`w-full bg-surface/50 border ${
                errors.due_date ? 'border-rose-500' : 'border-border'
              } rounded-lg px-3 py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
            />
            {errors.due_date && (
              <p className="mt-1 text-xs text-rose-500">{errors.due_date}</p>
            )}
          </div>

          {/* Priorité */}
          <div>
            <label htmlFor="priority" className="block text-xs sm:text-sm font-medium text-text-secondary mb-1">
              Priorité
            </label>
            <select
              id="priority"
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
              className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
            </select>
          </div>
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
              <>Créer le rappel</>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
};

export default ReminderForm;
