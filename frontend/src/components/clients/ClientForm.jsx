// src/components/clients/ClientForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiBriefcase, FiUser, FiX } from 'react-icons/fi';
import CompanyAutocomplete from '../common/CompanyAutocomplete';
import AddressAutocomplete from '../common/AddressAutocomplete';

const ClientForm = ({ client = {}, onSave, onCancel }) => {
  // État du formulaire avec valeurs par défaut ou existantes
  const [formData, setFormData] = useState({
    name: client.name || '',
    company: client.company || '',
    type: client.type || 'company',
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    website: client.website || '',
    industry: client.industry || '',
    source: client.source || '',
    contract_start_date: client.contract_start_date || '',
    lifetime_value: client.lifetime_value || 0,
    notes: client.notes || '',
    tags: client.tags || '',
    status: client.status || 'active'
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Options de source
  const sourceOptions = [
    { value: 'Référence', label: 'Référence' },
    { value: 'Site Web', label: 'Site Web' },
    { value: 'LinkedIn', label: 'LinkedIn' },
    { value: 'Salon professionnel', label: 'Salon professionnel' },
    { value: 'Publicité', label: 'Publicité' },
    { value: 'Contact direct', label: 'Contact direct' },
    { value: 'Autre', label: 'Autre' }
  ];

  // Options d'industrie
  const industryOptions = [
    { value: 'Technologie', label: 'Technologie' },
    { value: 'Finance', label: 'Finance' },
    { value: 'Santé', label: 'Santé' },
    { value: 'Éducation', label: 'Éducation' },
    { value: 'Commerce', label: 'Commerce' },
    { value: 'Services', label: 'Services' },
    { value: 'Industrie', label: 'Industrie' },
    { value: 'Immobilier', label: 'Immobilier' },
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

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalide';
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
          {client.id ? 'Modifier le client' : 'Nouveau client'}
        </h2>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onCancel}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <FiX className="text-xl" />
        </motion.button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Type de client */}
        <div>
          <label className="block text-gray-300 mb-3 font-medium">Type de client</label>
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFormData({ ...formData, type: 'company' })}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-colors ${
                formData.type === 'company'
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <FiBriefcase />
              <span>Entreprise</span>
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFormData({ ...formData, type: 'individual' })}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-colors ${
                formData.type === 'individual'
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <FiUser />
              <span>Particulier</span>
            </motion.button>
          </div>
        </div>

        {/* Informations de base */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nom */}
          <div>
            <label className="block text-gray-300 mb-2 font-medium">
              Nom {formData.type === 'individual' ? 'du contact' : 'du responsable'} *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`w-full px-4 py-2 bg-gray-900/50 border ${
                errors.name ? 'border-red-500' : 'border-gray-700'
              } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500`}
              placeholder="Jean Dupont"
            />
            {errors.name && <p className="mt-1 text-red-400 text-sm">{errors.name}</p>}
          </div>

          {/* Entreprise (si type company) avec auto-complétion */}
          {formData.type === 'company' && (
            <div>
              <label className="block text-gray-300 mb-2 font-medium">Entreprise *</label>
              <CompanyAutocomplete
                value={formData.company}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, company: value }));
                  if (errors.company) {
                    setErrors(prev => ({ ...prev, company: null }));
                  }
                }}
                onSelect={(companyDetails) => {
                  console.log('Entreprise sélectionnée:', companyDetails);
                  setFormData(prev => ({
                    ...prev,
                    company: companyDetails.name,
                    address: companyDetails.address || prev.address,
                    industry: companyDetails.activityLabel || prev.industry,
                    notes: prev.notes
                      ? `${prev.notes}\n\nInfos Sirene:\nSIREN: ${companyDetails.siren}${companyDetails.siret ? '\nSIRET: ' + companyDetails.siret : ''}\nForme juridique: ${companyDetails.legalForm}\nActivité: ${companyDetails.activityLabel}\nEffectifs: ${companyDetails.employees}`
                      : `Infos Sirene:\nSIREN: ${companyDetails.siren}${companyDetails.siret ? '\nSIRET: ' + companyDetails.siret : ''}\nForme juridique: ${companyDetails.legalForm}\nActivité: ${companyDetails.activityLabel}\nEffectifs: ${companyDetails.employees}`
                  }));
                }}
                placeholder="Rechercher une entreprise..."
                error={errors.company}
              />
            </div>
          )}
        </div>

        {/* Coordonnées */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className={`w-full px-4 py-2 bg-gray-900/50 border ${
                errors.email ? 'border-red-500' : 'border-gray-700'
              } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500`}
              placeholder="email@exemple.com"
            />
            {errors.email && <p className="mt-1 text-red-400 text-sm">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Téléphone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="+33 6 12 34 56 78"
            />
          </div>
        </div>

        {/* Adresse et site web */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Adresse</label>
            <AddressAutocomplete
              value={formData.address}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, address: value }));
              }}
              onSelect={(addressDetails) => {
                console.log('Adresse sélectionnée:', addressDetails);
                setFormData(prev => ({
                  ...prev,
                  address: addressDetails.address
                }));
              }}
              placeholder="Rechercher une adresse..."
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Site web</label>
            <input
              type="text"
              name="website"
              value={formData.website}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="www.exemple.com"
            />
          </div>
        </div>

        {/* Industrie et Source */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Industrie</label>
            <select
              name="industry"
              value={formData.industry}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 [&>option]:bg-gray-800 [&>option]:text-white"
            >
              <option value="" className="bg-gray-800 text-white">Sélectionner...</option>
              {industryOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-gray-800 text-white">{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Source</label>
            <select
              name="source"
              value={formData.source}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 [&>option]:bg-gray-800 [&>option]:text-white"
            >
              <option value="" className="bg-gray-800 text-white">Sélectionner...</option>
              {sourceOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-gray-800 text-white">{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dates et valeurs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Date de début du contrat</label>
            <input
              type="date"
              name="contract_start_date"
              value={formData.contract_start_date}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Valeur vie client (€)</label>
            <input
              type="number"
              name="lifetime_value"
              value={formData.lifetime_value}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="0"
              min="0"
              step="100"
            />
          </div>
        </div>

        {/* Statut et Tags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium">Statut</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 [&>option]:bg-gray-800 [&>option]:text-white"
            >
              <option value="active" className="bg-gray-800 text-white">Actif</option>
              <option value="inactive" className="bg-gray-800 text-white">Inactif</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium">Tags (séparés par des virgules)</label>
            <input
              type="text"
              name="tags"
              value={formData.tags}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="VIP, Premium, Important"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-gray-300 mb-2 font-medium">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Notes supplémentaires sur le client..."
          />
        </div>

        {/* Boutons */}
        <div className="flex gap-3 pt-4">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border-2 border-white/30 text-white hover:bg-white/10 hover:border-white/40 rounded-lg font-medium transition-all"
          >
            Annuler
          </motion.button>
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'Enregistrement...' : (client.id ? 'Enregistrer' : 'Créer')}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default ClientForm;
