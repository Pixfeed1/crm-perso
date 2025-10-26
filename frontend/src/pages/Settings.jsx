// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSave, FiBriefcase, FiMail } from 'react-icons/fi';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { settingsAPI } from '../services/settingsAPI';
import { useToast } from '../hooks/useToast';

const Settings = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('company');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    company_name: '',
    address: '',
    postal_code: '',
    city: '',
    country: 'France',
    siret: '',
    email: '',
    phone: '',
    logo_url: '',
    email_signature: ''
  });

  // Charger les paramètres au montage
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const settings = await settingsAPI.getSettings();
      if (settings) {
        setFormData(settings);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSignatureChange = (value) => {
    setFormData(prev => ({
      ...prev,
      email_signature: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await settingsAPI.updateSettings(formData);
      toast.success('Paramètres enregistrés avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      toast.error('Erreur lors de l\'enregistrement des paramètres');
    } finally {
      setIsSaving(false);
    }
  };

  // Configuration de l'éditeur Quill
  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link'],
      ['clean']
    ],
  };

  const quillFormats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'list', 'bullet',
    'align',
    'link'
  ];

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="text-center py-12 text-gray-400">
          Chargement...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
            Paramètres
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Configuration de votre entreprise
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
        >
          <FiSave />
          <span>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</span>
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'company'
              ? 'border-indigo-500 text-indigo-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <FiBriefcase />
          <span>Informations entreprise</span>
        </button>
        <button
          onClick={() => setActiveTab('email')}
          className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'email'
              ? 'border-indigo-500 text-indigo-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <FiMail />
          <span>Configuration emails</span>
        </button>
      </div>

      {/* Contenu des onglets */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeTab === 'company' && (
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Nom entreprise */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom de l'entreprise
                </label>
                <input
                  type="text"
                  name="company_name"
                  value={formData.company_name || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Mon Entreprise"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email professionnel
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="contact@entreprise.com"
                />
              </div>

              {/* Téléphone */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Téléphone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="01 23 45 67 89"
                />
              </div>

              {/* SIRET */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  SIRET
                </label>
                <input
                  type="text"
                  name="siret"
                  value={formData.siret || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="123 456 789 00012"
                />
              </div>

              {/* Adresse */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Adresse
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="123 Rue de la République"
                />
              </div>

              {/* Code postal */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Code postal
                </label>
                <input
                  type="text"
                  name="postal_code"
                  value={formData.postal_code || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="75001"
                />
              </div>

              {/* Ville */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Ville
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Paris"
                />
              </div>

              {/* Pays */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Pays
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country || 'France'}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="France"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  URL du logo
                </label>
                <input
                  type="text"
                  name="logo_url"
                  value={formData.logo_url || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="https://..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  URL de votre logo (utilisé dans les PDF)
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Signature email
              </label>
              <p className="text-xs text-gray-500 mb-4">
                Personnalisez votre signature pour les emails envoyés depuis l'application
              </p>
              <div className="bg-white rounded-lg">
                <ReactQuill
                  theme="snow"
                  value={formData.email_signature || ''}
                  onChange={handleSignatureChange}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="Tapez votre signature ici..."
                  style={{ height: '250px', marginBottom: '42px' }}
                />
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Settings;
