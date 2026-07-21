// src/components/projects/ProjectForm.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../../hooks/useToast';
import TemplateSelector from '../common/TemplateSelector';
import { templateCategories } from '../../services/templates';
import { clientsAPI, leadsAPI } from '../../services/api';

const ProjectForm = ({ project = {}, onSave, onCancel }) => {
  const { toast } = useToast();
  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    name: project.name || '',
    type: project.type || 'site-web',
    // Un projet est rattaché SOIT à un client SOIT à un lead : on garde les deux ids
    // (l'un des deux à null) au lieu de tout mettre dans lead_id (bug historique).
    client_id: project.client_id || '',
    lead_id: project.lead_id || '',
    lead_name: project.lead_name || project.client_name || '',
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

  // Charger les clients et leads depuis l'API
  useEffect(() => {
    const fetchClientsAndLeads = async () => {
      setLoadingLeads(true);
      try {
        // Récupérer les clients et les leads en parallèle
        const [clientsData, leadsData] = await Promise.all([
          clientsAPI.getAll().catch(err => {
            console.error('Erreur lors du chargement des clients:', err);
            return [];
          }),
          leadsAPI.getAll().catch(err => {
            console.error('Erreur lors du chargement des leads:', err);
            return [];
          })
        ]);

        // Combiner clients et leads dans une seule liste
        // Les clients sont marqués comme type 'client' et les leads comme type 'lead'
        const combinedList = [
          ...clientsData.map(client => ({
            id: `client-${client.id}`,
            originalId: client.id,
            name: client.name,
            type: 'client',
            displayName: `${client.name} (Client)`
          })),
          ...leadsData.map(lead => ({
            id: `lead-${lead.id}`,
            originalId: lead.id,
            name: lead.name,
            type: 'lead',
            displayName: `${lead.name} (Lead)`
          }))
        ];

        // Trier par nom
        combinedList.sort((a, b) => a.name.localeCompare(b.name));

        setLeads(combinedList);
      } catch (error) {
        console.error('Erreur lors du chargement des clients/leads:', error);
        toast.error('Impossible de charger la liste des clients/leads');
      } finally {
        setLoadingLeads(false);
      }
    };

    fetchClientsAndLeads();
  }, [toast]);

  // Options de type
  const typeOptions = [
    { value: 'site-web', label: 'Site Web' },
    { value: 'application-mobile', label: 'Application Mobile' },
    { value: 'application-bureau', label: 'Application Bureau' },
    { value: 'design', label: 'Design' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'autre', label: 'Autre' }
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
      // Si vide ou non numérique, mettre 0 ou la chaîne vide
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
  
  // Mise à jour spécifique pour le sélecteur de lead/client
  const handleLeadChange = (e) => {
    const selectedId = e.target.value;
    const selectedItem = leads.find(item => item.id === selectedId);

    if (selectedItem) {
      // Selon le type sélectionné, on remplit client_id OU lead_id (l'autre à vide).
      setFormData(prev => ({
        ...prev,
        client_id: selectedItem.type === 'client' ? selectedItem.originalId : '',
        lead_id: selectedItem.type === 'lead' ? selectedItem.originalId : '',
        lead_name: selectedItem.name
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        client_id: '',
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
        // Rattachement : client_id ET lead_id transmis (l'un des deux à null selon la sélection).
        client_id: formData.client_id ? parseInt(formData.client_id) : null,
        lead_id: formData.lead_id ? parseInt(formData.lead_id) : null,
        amount: formData.amount === '' ? 0 : parseFloat(formData.amount),
        // Assurer que les dates sont au bon format
        start_date: formData.start_date,
        end_date: formData.end_date
      };
      
      console.log('Envoi des données du projet:', projectData);
      
      // Appeler la fonction de sauvegarde passée par le parent
      await onSave(projectData);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error("Erreur lors de la sauvegarde du projet: " + (error.message || "Erreur inconnue"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-surface/30 border border-border rounded-2xl p-6"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-text-primary">
          {project.id ? 'Modifier le projet' : 'Nouveau projet'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 w-full">
        {/* Nom du projet */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1">
            Nom du projet<span className="text-rose-400 ml-1">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className={`w-full bg-surface-strong border ${
              errors.name ? 'border-rose-500' : 'border-border-strong'
            } rounded-lg px-4 py-2 text-text-primary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            placeholder="Site E-commerce 2025"
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Type de projet */}
          <div>
          <label htmlFor="type" className="block text-sm font-medium text-text-secondary mb-1">
              Type de projet
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              className="w-full bg-surface-strong border border-border-strong rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {typeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {/* Client/Lead */}
          <div>
            <label htmlFor="lead_id" className="block text-sm font-medium text-text-secondary mb-1">
              Client / Lead
            </label>
            <select
              id="lead_id"
              name="lead_id"
              value={formData.client_id ? `client-${formData.client_id}` : formData.lead_id ? `lead-${formData.lead_id}` : ''}
              onChange={handleLeadChange}
              className={`w-full bg-surface-strong border ${
                errors.lead_id ? 'border-rose-500' : 'border-border-strong'
              } rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
              disabled={loadingLeads}
            >
              <option value="">{loadingLeads ? 'Chargement...' : 'Sélectionner un client ou lead'}</option>
              {leads.map(item => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
            {errors.lead_id && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 text-xs text-rose-500"
              >
                {errors.lead_id}
              </motion.p>
            )}
          </div>
        </div>
        
        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="description" className="block text-sm font-medium text-text-secondary">
              Description
            </label>
            <TemplateSelector
              category={templateCategories.PROJECT}
              currentValue={formData.description}
              onSelect={(content) => setFormData(prev => ({ ...prev, description: content }))}
              buttonText="Template"
            />
          </div>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={4}
            className="w-full bg-surface-strong border border-border-strong rounded-lg px-4 py-2 text-text-primary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Description détaillée du projet..."
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date de début */}
          <div>
            <label htmlFor="start_date" className="block text-sm font-medium text-text-secondary mb-1">
              Date de début<span className="text-rose-400 ml-1">*</span>
            </label>
            <input
              type="date"
              id="start_date"
              name="start_date"
              value={formData.start_date}
              onChange={handleInputChange}
              className={`w-full bg-surface-strong border ${
                errors.start_date ? 'border-rose-500' : 'border-border-strong'
              } rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
            {errors.start_date && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 text-xs text-rose-500"
              >
                {errors.start_date}
              </motion.p>
            )}
          </div>
          
          {/* Date de fin */}
          <div>
            <label htmlFor="end_date" className="block text-sm font-medium text-text-secondary mb-1">
              Date de fin<span className="text-rose-400 ml-1">*</span>
            </label>
            <input
              type="date"
              id="end_date"
              name="end_date"
              value={formData.end_date}
              onChange={handleInputChange}
              className={`w-full bg-surface-strong border ${
                errors.end_date ? 'border-rose-500' : 'border-border-strong'
              } rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
            {errors.end_date && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 text-xs text-rose-500"
              >
                {errors.end_date}
              </motion.p>
            )}
          </div>
          
          {/* Statut */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-text-secondary mb-1">
              Statut
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full bg-surface-strong border border-border-strong rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Montant */}
        <div className="max-w-xs">
          <label htmlFor="amount" className="block text-sm font-medium text-text-secondary mb-1">
            Montant (€)
          </label>
          <div className="relative">
            <input
              type="number"
              id="amount"
              name="amount"
              value={formData.amount === 0 ? 0 : formData.amount || ''}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              className={`w-full bg-surface-strong border ${
                errors.amount ? 'border-rose-500' : 'border-border-strong'
              } rounded-lg px-4 py-2 pl-10 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted">
              €
            </span>
          </div>
          {errors.amount && (
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.amount}
            </motion.p>
          )}
        </div>
        
        {/* Boutons d'action */}
        <div className="flex justify-end space-x-3 pt-4">
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
    </motion.div>
  );
};

export default ProjectForm;