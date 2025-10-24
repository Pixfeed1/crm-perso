// src/components/projects/ProjectForm.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../../hooks/useToast';

const ProjectForm = ({ project = {}, onSave, onCancel }) => {
  const { toast } = useToast();
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
        // Convertir les valeurs appropriées
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
    <div className="w-full max-w-full">
      <h2 className="text-2xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300">
        {project.id ? 'Modifier le projet' : 'Nouveau projet'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4 w-full">
        {/* Nom du projet */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
            Nom du projet<span className="text-rose-500 ml-1">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className={`w-full bg-white/90 border ${
              errors.name ? 'border-rose-500' : 'border-gray-300'
            } rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
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
          <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-1">
              Type de projet
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              className="w-full bg-white/90 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {typeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          {/* Client (Lead) */}
          <div>
            <label htmlFor="lead_id" className="block text-sm font-medium text-gray-300 mb-1">
              Client
            </label>
            <select
              id="lead_id"
              name="lead_id"
              value={formData.lead_id}
              onChange={handleLeadChange}
              className={`w-full bg-white/90 border ${
                errors.lead_id ? 'border-rose-500' : 'border-gray-300'
              } rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
              disabled={loadingLeads}
            >
              <option value="">Sélectionner un client</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>
                  {lead.name}
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
          <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={4}
            className="w-full bg-white/90 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Description détaillée du projet..."
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date de début */}
          <div>
            <label htmlFor="start_date" className="block text-sm font-medium text-gray-300 mb-1">
              Date de début<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="date"
              id="start_date"
              name="start_date"
              value={formData.start_date}
              onChange={handleInputChange}
              className={`w-full bg-white/90 border ${
                errors.start_date ? 'border-rose-500' : 'border-gray-300'
              } rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
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
            <label htmlFor="end_date" className="block text-sm font-medium text-gray-300 mb-1">
              Date de fin<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="date"
              id="end_date"
              name="end_date"
              value={formData.end_date}
              onChange={handleInputChange}
              className={`w-full bg-white/90 border ${
                errors.end_date ? 'border-rose-500' : 'border-gray-300'
              } rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
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
            <label htmlFor="status" className="block text-sm font-medium text-gray-300 mb-1">
              Statut
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full bg-white/90 border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
          <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1">
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
              className={`w-full bg-white/90 border ${
                errors.amount ? 'border-rose-500' : 'border-gray-300'
              } rounded-lg px-4 py-2 pl-10 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600">
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
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
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

export default ProjectForm;