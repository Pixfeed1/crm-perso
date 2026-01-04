// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSave, FiBriefcase, FiMail, FiCheckCircle, FiXCircle, FiAlertCircle, FiVideo, FiBell } from 'react-icons/fi';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { settingsAPI } from '../services/settingsAPI';
import { useToast } from '../hooks/useToast';
import VideoConferenceSettings from '../components/settings/VideoConferenceSettings';
import ReminderSettings from '../components/settings/ReminderSettings';

const Settings = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('company');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState(null);

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

  const handleTestEmail = async () => {
    setIsTestingEmail(true);
    setEmailTestResult(null);
    try {
      const result = await settingsAPI.testEmail();
      setEmailTestResult(result);
      if (result.success) {
        toast.success('Configuration email validée avec succès');
      } else {
        toast.error('Échec du test de configuration email');
      }
    } catch (error) {
      console.error('Erreur lors du test email:', error);
      setEmailTestResult({
        success: false,
        error: error.message || 'Erreur inconnue'
      });
      toast.error('Erreur lors du test de configuration');
    } finally {
      setIsTestingEmail(false);
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
      <div className="flex gap-2 mb-6 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
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
          className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'email'
              ? 'border-indigo-500 text-indigo-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <FiMail />
          <span>Configuration emails</span>
        </button>
        <button
          onClick={() => setActiveTab('video')}
          className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'video'
              ? 'border-indigo-500 text-indigo-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <FiVideo />
          <span>Visioconférence</span>
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'reminders'
              ? 'border-indigo-500 text-indigo-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <FiBell />
          <span>Relances automatiques</span>
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
          <div className="space-y-6">
            {/* Configuration SMTP */}
            <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Configuration SMTP</h3>
              <p className="text-sm text-gray-400 mb-4">
                La configuration SMTP se fait via le fichier <code className="bg-gray-900 px-2 py-1 rounded">.env</code> du backend.
                <br />
                Référez-vous au fichier <code className="bg-gray-900 px-2 py-1 rounded">.env.example</code> pour les détails de configuration.
              </p>

              <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Variables requises :</h4>
                <div className="space-y-2 font-mono text-xs text-gray-400">
                  <div>• EMAIL_HOST (ex: mail.votre-domaine.com)</div>
                  <div>• EMAIL_PORT (ex: 587)</div>
                  <div>• EMAIL_USER (ex: contact@votre-domaine.com)</div>
                  <div>• EMAIL_PASSWORD</div>
                  <div>• EMAIL_FROM_NAME (ex: Mon Entreprise)</div>
                </div>
              </div>

              {/* Bouton test */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleTestEmail}
                  disabled={isTestingEmail}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  <FiMail />
                  <span>{isTestingEmail ? 'Test en cours...' : 'Tester la connexion SMTP'}</span>
                </button>

                {/* Résultat du test */}
                {emailTestResult && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      emailTestResult.success
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {emailTestResult.success ? (
                      <>
                        <FiCheckCircle />
                        <span className="text-sm font-medium">Connexion réussie</span>
                      </>
                    ) : (
                      <>
                        <FiXCircle />
                        <span className="text-sm font-medium">Échec de la connexion</span>
                      </>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Détails de l'erreur */}
              {emailTestResult && !emailTestResult.success && emailTestResult.error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg"
                >
                  <div className="flex items-start gap-2">
                    <FiAlertCircle className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-300 mb-1">Erreur de configuration</p>
                      <p className="text-xs text-red-200">{emailTestResult.error}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Signature email */}
            <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Signature email</h3>
              <p className="text-sm text-gray-400 mb-4">
                Personnalisez votre signature pour les emails envoyés depuis l'application
              </p>

              {/* Templates de signature */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Modèles de signature
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSignatureChange(`
<table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif;">
  <tr>
    <td style="padding-right: 15px; border-right: 2px solid #6366f1;">
      <img src="${formData.logo_url || 'https://via.placeholder.com/80x80?text=Logo'}" alt="Logo" style="width: 80px; height: auto;" />
    </td>
    <td style="padding-left: 15px;">
      <div style="font-size: 16px; font-weight: bold; color: #1f2937;">${formData.company_name || 'Votre Entreprise'}</div>
      <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">${formData.email || 'email@exemple.com'}</div>
      <div style="font-size: 13px; color: #6b7280;">${formData.phone || '01 23 45 67 89'}</div>
      <div style="font-size: 12px; color: #9ca3af; margin-top: 8px;">${formData.address || ''} ${formData.postal_code || ''} ${formData.city || ''}</div>
    </td>
  </tr>
</table>
                    `)}
                    className="p-3 bg-gray-900/50 border border-gray-700 rounded-lg hover:border-indigo-500 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-white mb-1">Professionnel</div>
                    <div className="text-xs text-gray-400">Logo + coordonnées</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSignatureChange(`
<div style="font-family: Arial, sans-serif; border-top: 3px solid #6366f1; padding-top: 15px; margin-top: 20px;">
  <div style="font-size: 15px; font-weight: bold; color: #1f2937;">${formData.company_name || 'Votre Entreprise'}</div>
  <div style="font-size: 13px; color: #6366f1; margin-top: 2px;">Développement Web & Digital</div>
  <div style="margin-top: 10px;">
    <span style="font-size: 12px; color: #6b7280;">📧 ${formData.email || 'email@exemple.com'}</span>
    <span style="font-size: 12px; color: #6b7280; margin-left: 15px;">📞 ${formData.phone || '01 23 45 67 89'}</span>
  </div>
  <div style="font-size: 11px; color: #9ca3af; margin-top: 8px;">🌐 www.votre-site.com</div>
</div>
                    `)}
                    className="p-3 bg-gray-900/50 border border-gray-700 rounded-lg hover:border-indigo-500 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-white mb-1">Moderne</div>
                    <div className="text-xs text-gray-400">Style épuré avec bordure</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSignatureChange(`
<div style="font-family: Arial, sans-serif;">
  <p style="font-size: 14px; color: #374151; margin: 0;">Cordialement,</p>
  <p style="font-size: 15px; font-weight: bold; color: #1f2937; margin: 8px 0 4px 0;">${formData.company_name || 'Votre Entreprise'}</p>
  <p style="font-size: 13px; color: #6b7280; margin: 0;">${formData.email || 'email@exemple.com'} | ${formData.phone || '01 23 45 67 89'}</p>
</div>
                    `)}
                    className="p-3 bg-gray-900/50 border border-gray-700 rounded-lg hover:border-indigo-500 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-white mb-1">Simple</div>
                    <div className="text-xs text-gray-400">Minimaliste</div>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg [&_.ql-editor]:text-black [&_.ql-editor]:text-base [&_.ql-editor_*]:text-black">
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

        {activeTab === 'video' && (
          <VideoConferenceSettings />
        )}

        {activeTab === 'reminders' && (
          <ReminderSettings />
        )}
      </motion.div>
    </div>
  );
};

export default Settings;
