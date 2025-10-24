// src/components/projects/ProjectForm.jsx
import React, { useState, useEffect } from 'react';
import FormInput from '../common/FormInput';
import FormSelect from '../common/FormSelect';
import FormTextarea from '../common/FormTextarea';
import { FormButtons } from '../common/Button';

const ProjectForm = ({ project = {}, onSave, onCancel }) => {
  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    name: project.name || '',
    type: project.type || 'site-web',
    lead_id: project.lead_id || '',
    lead_name: project.lead_name || '',
    description: project.description || '',
    start_date: project.start_date || new Date().toISOString().split('T')[0],
    end_date: project.end_date || '',
    status: project.status || 'planifié',
    amount: project.amount || 0
  });

  const [leads, setLeads] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Charger les leads pour le sélecteur
  useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      try {
        // Dans un scénario réel, nous récupérerions depuis l'API
        // Pour l'exemple, utilisons des données fictives
        setTimeout(() => {
          const mockLeads = [
            { id: 1, name: 'Acme Corporation' },
            { id: 2, name: 'Technologie Future' },
            { id: 3, name: 'Julie Martin' }
          ];
          setLeads(mockLeads);
          setLoadingLeads(false);
        }, 500);
      } catch (error) {
        console.error('Erreur lors du chargement des leads:', error);
        setLoadingLeads(false);
      }
    };

    fetchLeads();
  }, []);

  // Options de type
  const typeOptions = [
    { value: 'site-web', label: '🌐 Site Web' },
    { value: 'application-mobile', label: '📱 Application Mobile' },
    { value: 'application-bureau', label: '💻 Application Bureau' },
    { value: 'design', label: '🎨 Design' },
    { value: 'marketing', label: '📢 Marketing' },
    { value: 'maintenance', label: '🔧 Maintenance' },
    { value: 'autre', label: '📦 Autre' }
  ];

  // Options de statut
  const statusOptions = [
    { value: 'planifié', label: 'Planifié' },
    { value: 'en-cours', label: 'En cours' },
    { value: 'pause', label: 'En pause' },
    { value: 'terminé', label: 'Terminé' },
    { value: 'annulé', label: 'Annulé' }
  ];

  // Mise à jour des champs du formulaire
  const handleInputChange = (e) => {
    const { name, value, type } = e.target;

    // Conversion des valeurs numériques
    if (type === 'number') {
      const parsedValue = value === '' ? '' : isNaN(parseFloat(value)) ? 0 : parseFloat(value);
      setFormData(prev => ({
        ...prev,
        [name]: parsedValue
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Effacer les erreurs lors de la saisie
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Mise à jour spécifique pour le sélecteur de lead
  const handleLeadChange = (e) => {
    const leadId = parseInt(e.target.value);
    const selectedLead = leads.find(lead => lead.id === leadId);

    if (selectedLead) {
      setFormData(prev => ({
        ...prev,
        lead_id: leadId,
        lead_name: selectedLead.name
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        lead_id: '',
        lead_name: ''
      }));
    }

    // Effacer les erreurs de lead
    if (errors.lead_id) {
      setErrors(prev => ({
        ...prev,
        lead_id: null
      }));
    }
  };

  // Validation du formulaire
  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Le nom du projet est requis';
    }

    if (!formData.start_date) {
      newErrors.start_date = 'La date de début est requise';
    }

    if (!formData.end_date) {
      newErrors.end_date = 'La date de fin est requise';
    } else if (new Date(formData.end_date) <= new Date(formData.start_date)) {
      newErrors.end_date = 'La date de fin doit être postérieure à la date de début';
    }

    if (typeof formData.amount === 'number' && formData.amount < 0) {
      newErrors.amount = 'Le montant ne peut pas être négatif';
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

      // Préparation des données à envoyer
      const projectData = {
        ...formData,
        lead_id: formData.lead_id ? parseInt(formData.lead_id) : null,
        amount: formData.amount === '' ? 0 : parseFloat(formData.amount),
        start_date: formData.start_date,
        end_date: formData.end_date
      };

      console.log('Envoi des données du projet:', projectData);

      await onSave(projectData);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert("Erreur lors de la sauvegarde du projet: " + (error.message || "Erreur inconnue"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-full">
      <h2 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300">
        {project.id ? 'Modifier le projet' : 'Nouveau projet'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4 w-full">
        {/* Nom du projet */}
        <FormInput
          label="Nom du projet"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          error={errors.name}
          placeholder="Site E-commerce 2025"
          required
          variant="light"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Type de projet */}
          <FormSelect
            label="Type de projet"
            name="type"
            value={formData.type}
            onChange={handleInputChange}
            options={typeOptions}
            variant="light"
          />

          {/* Client (Lead) */}
          <FormSelect
            label="Client"
            name="lead_id"
            value={formData.lead_id}
            onChange={handleLeadChange}
            error={errors.lead_id}
            options={leads.map(lead => ({ value: lead.id, label: lead.name }))}
            placeholder="Sélectionner un client"
            disabled={loadingLeads}
            variant="light"
          />
        </div>

        {/* Description */}
        <FormTextarea
          label="Description"
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={4}
          placeholder="Description détaillée du projet..."
          variant="light"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date de début */}
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

          {/* Date de fin */}
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

          {/* Statut */}
          <FormSelect
            label="Statut"
            name="status"
            value={formData.status}
            onChange={handleInputChange}
            options={statusOptions}
            variant="light"
          />
        </div>

        {/* Montant */}
        <div className="max-w-xs">
          <FormInput
            label="Montant (€)"
            type="number"
            name="amount"
            value={formData.amount === 0 ? 0 : formData.amount || ''}
            onChange={handleInputChange}
            error={errors.amount}
            step="0.01"
            min="0"
            variant="light"
            inputClassName="pl-10"
          />
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 pointer-events-none">
            €
          </span>
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

export default ProjectForm;
