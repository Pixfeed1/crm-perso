// src/components/maintenance/MaintenanceForm.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiGlobe, FiUser, FiChevronDown } from 'react-icons/fi';
import { clientsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const MaintenanceForm = ({ contract = {}, onSave, onCancel }) => {
  const { toast } = useToast();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  // État du formulaire
  const [formData, setFormData] = useState({
    client_id: contract.client_id || '',
    site_name: contract.site_name || '',
    site_url: contract.site_url || '',
    contract_start_date: contract.contract_start_date ? contract.contract_start_date.split('T')[0] : '',
    monthly_amount: contract.monthly_amount || '',
    status: contract.status || 'active',
    wordpress_version: contract.wordpress_version || '',
    php_version: contract.php_version || '',
    hosting_provider: contract.hosting_provider || '',
    admin_url: contract.admin_url || '',
    pagespeed_mobile: contract.pagespeed_mobile || '',
    pagespeed_desktop: contract.pagespeed_desktop || '',
    plugins_count: contract.plugins_count || '',
    notes: contract.notes || ''
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Charger les clients
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const clientsData = await clientsAPI.getAll();
        setClients(clientsData);
      } catch (error) {
        console.error('Erreur lors du chargement des clients:', error);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  // Options de statut
  const statusOptions = [
    { value: 'active', label: 'Actif' },
    { value: 'paused', label: 'En pause' },
    { value: 'cancelled', label: 'Annulé' }
  ];

  // Mise à jour des champs
  const handleInputChange = (e) => {
    const { name, value, type } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
    }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Validation
  const validateForm = () => {
    const newErrors = {};
    if (!formData.site_name.trim()) {
      newErrors.site_name = 'Le nom du site est requis';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Soumission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);

      const dataToSend = {
        ...formData,
        client_id: formData.client_id || null,
        monthly_amount: formData.monthly_amount || 0,
        pagespeed_mobile: formData.pagespeed_mobile || null,
        pagespeed_desktop: formData.pagespeed_desktop || null,
        plugins_count: formData.plugins_count || 0
      };

      await onSave(dataToSend);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
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
          {contract.id ? 'Modifier le contrat' : 'Nouveau contrat maintenance'}
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
        {/* Informations principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nom du site */}
          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">
              Nom du site <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              name="site_name"
              value={formData.site_name}
              onChange={handleInputChange}
              className={`w-full h-11 box-border px-4 bg-gray-900/50 border ${
                errors.site_name ? 'border-rose-500' : 'border-gray-700'
              } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500`}
              placeholder="Mon Site WordPress"
            />
            {errors.site_name && <p className="mt-1 text-rose-400 text-sm">{errors.site_name}</p>}
          </div>

          {/* Client */}
          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Client</label>
            <div className="relative">
              <select
                name="client_id"
                value={formData.client_id}
                onChange={handleInputChange}
                className="w-full h-11 box-border px-4 pr-10 appearance-none bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                disabled={loadingClients}
              >
                <option value="">{loadingClients ? 'Chargement...' : 'Sélectionner un client'}</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
              <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* URL et Admin */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">URL du site</label>
            <input
              type="text"
              name="site_url"
              value={formData.site_url}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="https://monsite.com"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">URL Admin WordPress</label>
            <input
              type="text"
              name="admin_url"
              value={formData.admin_url}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="https://monsite.com/wp-admin"
            />
          </div>
        </div>

        {/* Contrat */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Date début contrat</label>
            <input
              type="date"
              name="contract_start_date"
              value={formData.contract_start_date}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Montant mensuel</label>
            <div className="relative">
              <input
                type="number"
                name="monthly_amount"
                value={formData.monthly_amount}
                onChange={handleInputChange}
                className="w-full h-11 box-border px-4 pl-8 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="0"
                min="0"
                step="0.01"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">€</span>
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Statut</label>
            <div className="relative">
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full h-11 box-border px-4 pr-10 appearance-none bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Technique */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Version WordPress</label>
            <input
              type="text"
              name="wordpress_version"
              value={formData.wordpress_version}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="6.4.2"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Version PHP</label>
            <input
              type="text"
              name="php_version"
              value={formData.php_version}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="8.2"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Hébergeur</label>
            <input
              type="text"
              name="hosting_provider"
              value={formData.hosting_provider}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="OVH, o2switch..."
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Nb plugins</label>
            <input
              type="number"
              name="plugins_count"
              value={formData.plugins_count}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="0"
              min="0"
            />
          </div>
        </div>

        {/* PageSpeed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">PageSpeed Mobile</label>
            <input
              type="number"
              name="pagespeed_mobile"
              value={formData.pagespeed_mobile}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="0-100"
              min="0"
              max="100"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">PageSpeed Desktop</label>
            <input
              type="number"
              name="pagespeed_desktop"
              value={formData.pagespeed_desktop}
              onChange={handleInputChange}
              className="w-full h-11 box-border px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="0-100"
              min="0"
              max="100"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-gray-300 mb-2 font-medium whitespace-nowrap">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Notes internes sur ce contrat..."
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
            {submitting ? 'Enregistrement...' : (contract.id ? 'Enregistrer' : 'Créer')}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default MaintenanceForm;
