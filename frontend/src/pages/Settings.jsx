// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSave, FiBriefcase, FiMail, FiCheckCircle, FiXCircle, FiAlertCircle, FiVideo, FiBell, FiSun, FiMoon } from 'react-icons/fi';
import DOMPurify from 'dompurify';
import { settingsAPI } from '../services/settingsAPI';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../contexts/ThemeContext';
import VideoConferenceSettings from '../components/settings/VideoConferenceSettings';
import ReminderSettings from '../components/settings/ReminderSettings';

const Settings = () => {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
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

  // Templates de signature email (avec align="left" pour éviter le centrage)
  const signatureTemplates = {
    executive: `<table cellpadding="0" cellspacing="0" border="0" align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #374151;">
  <tr>
    <td valign="top" style="padding-right: 20px; border-right: 3px solid #6366f1;">
      <img src="https://pixfeed.net/wp-content/uploads/2025/04/logo.png" alt="Pixfeed" width="70" style="display: block;">
      <p style="margin: 10px 0 0 0; font-size: 10px; color: #9ca3af; font-style: italic; max-width: 70px; line-height: 1.3;">L'humain au cœur de nos solutions</p>
    </td>
    <td valign="top" style="padding-left: 20px;">
      <p style="margin: 0 0 2px 0; font-size: 16px; font-weight: 600; color: #111827;">Marc Gueffie</p>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #6366f1; font-weight: 500;">Fondateur &amp; développeur - Pixfeed</p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;"><a href="tel:0645373930" style="color: #6b7280; text-decoration: none;">06.45.37.39.30</a></p>
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #6b7280;"><a href="mailto:mgueffie@pixfeed.net" style="color: #6b7280; text-decoration: none;">mgueffie@pixfeed.net</a></p>
      <p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280;"><a href="https://pixfeed.net" style="color: #6366f1; text-decoration: none; font-weight: 500;">pixfeed.net</a></p>
      <p style="margin: 0;">
        <a href="https://www.linkedin.com/company/pixfeed/" style="display: inline; text-decoration: none; margin-right: 8px;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/linkedinmail.png" alt="LinkedIn" width="20" height="20" style="display: inline; vertical-align: middle;"></a>
        <a href="https://www.facebook.com/Pixfeed" style="display: inline; text-decoration: none;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/fasebookmail.png" alt="Facebook" width="20" height="20" style="display: inline; vertical-align: middle;"></a>
      </p>
    </td>
  </tr>
</table>`,

    minimal: `<table cellpadding="0" cellspacing="0" border="0" align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #374151;">
  <tr>
    <td>
      <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #111827;">Marc Gueffie</p>
      <p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280;">Fondateur &amp; développeur - <span style="color: #6366f1; font-weight: 500;">Pixfeed</span></p>
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">06.45.37.39.30 · mgueffie@pixfeed.net · <a href="https://pixfeed.net" style="color: #6366f1; text-decoration: none;">pixfeed.net</a></p>
      <p style="margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; font-style: italic;">L'humain au cœur de nos solutions</p>
    </td>
  </tr>
</table>`,

    modern: `<table cellpadding="0" cellspacing="0" border="0" align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #374151;">
  <tr>
    <td style="border-left: 4px solid #6366f1; padding-left: 16px;">
      <img src="https://pixfeed.net/wp-content/uploads/2025/04/logo.png" alt="Pixfeed" height="28" style="display: block; height: 28px; width: auto; margin-bottom: 10px;">
      <p style="margin: 0 0 2px 0; font-size: 16px; font-weight: 700; color: #111827;">Marc Gueffie</p>
      <p style="margin: 0 0 12px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6366f1; font-weight: 600;">Fondateur &amp; développeur</p>
      <p style="margin: 0 0 3px 0; font-size: 13px;"><a href="mailto:mgueffie@pixfeed.net" style="color: #6b7280; text-decoration: none;">mgueffie@pixfeed.net</a></p>
      <p style="margin: 0 0 3px 0; font-size: 13px;"><a href="tel:0645373930" style="color: #6b7280; text-decoration: none;">06.45.37.39.30</a></p>
      <p style="margin: 0 0 10px 0; font-size: 13px;"><a href="https://pixfeed.net" style="color: #6366f1; text-decoration: none; font-weight: 500;">pixfeed.net</a></p>
      <p style="margin: 0;">
        <a href="https://www.linkedin.com/company/pixfeed/" style="display: inline; text-decoration: none; margin-right: 6px;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/linkedinmail.png" alt="LinkedIn" width="18" height="18" style="display: inline; vertical-align: middle;"></a>
        <a href="https://www.facebook.com/Pixfeed" style="display: inline; text-decoration: none;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/fasebookmail.png" alt="Facebook" width="18" height="18" style="display: inline; vertical-align: middle;"></a>
      </p>
      <p style="margin: 10px 0 0 0; font-size: 10px; color: #9ca3af; font-style: italic;">L'humain au cœur de nos solutions</p>
    </td>
  </tr>
</table>`,

    classic: `<table cellpadding="0" cellspacing="0" border="0" align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #374151;">
  <tr>
    <td style="padding-bottom: 12px;">
      <img src="https://pixfeed.net/wp-content/uploads/2025/04/logo.png" alt="Pixfeed" height="45" style="display: inline-block; height: 45px; width: auto;">
    </td>
  </tr>
  <tr>
    <td style="padding-bottom: 10px; border-bottom: 2px solid #6366f1;">
      <p style="margin: 0 0 2px 0; font-size: 17px; font-weight: 600; color: #111827;">Marc Gueffie</p>
      <p style="margin: 0; font-size: 13px; color: #6366f1;">Fondateur &amp; développeur - Pixfeed</p>
    </td>
  </tr>
  <tr>
    <td style="padding-top: 10px;">
      <p style="margin: 0; font-size: 13px; color: #6b7280;">
        <a href="tel:0645373930" style="color: #6b7280; text-decoration: none;">06.45.37.39.30</a> ·
        <a href="mailto:mgueffie@pixfeed.net" style="color: #6b7280; text-decoration: none;">mgueffie@pixfeed.net</a>
      </p>
      <p style="margin: 6px 0 0 0;"><a href="https://pixfeed.net" style="color: #6366f1; text-decoration: none; font-weight: 500;">pixfeed.net</a></p>
      <p style="margin: 10px 0 0 0; font-size: 11px; color: #9ca3af; font-style: italic;">L'humain au cœur de nos solutions</p>
      <p style="margin: 10px 0 0 0;">
        <a href="https://www.linkedin.com/company/pixfeed/" style="display: inline; text-decoration: none; margin: 0 4px;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/linkedinmail.png" alt="LinkedIn" width="18" height="18" style="display: inline; vertical-align: middle;"></a>
        <a href="https://www.facebook.com/Pixfeed" style="display: inline; text-decoration: none; margin: 0 4px;"><img src="https://pixfeed.net/wp-content/uploads/2026/01/fasebookmail.png" alt="Facebook" width="18" height="18" style="display: inline; vertical-align: middle;"></a>
      </p>
    </td>
  </tr>
</table>`
  };


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
        <button
          onClick={() => setActiveTab('appearance')}
          className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'appearance'
              ? 'border-indigo-500 text-indigo-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <FiSun />
          <span>Apparence</span>
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
                  Choisissez votre modèle de signature
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Template Executive */}
                  <button
                    type="button"
                    onClick={() => handleSignatureChange(signatureTemplates.executive)}
                    className={`p-3 rounded-lg transition-colors text-left ${
                      formData.email_signature === signatureTemplates.executive
                        ? 'bg-indigo-600/40 border-2 border-indigo-400 ring-2 ring-indigo-400/30'
                        : 'bg-indigo-900/30 border border-indigo-500/50 hover:border-indigo-400'
                    }`}
                  >
                    <div className="text-sm font-medium text-indigo-400 mb-1">Executive</div>
                    <div className="text-xs text-gray-400">Logo à gauche, structuré</div>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded">Recommandé</span>
                  </button>

                  {/* Template Minimal */}
                  <button
                    type="button"
                    onClick={() => handleSignatureChange(signatureTemplates.minimal)}
                    className={`p-3 rounded-lg transition-colors text-left ${
                      formData.email_signature === signatureTemplates.minimal
                        ? 'bg-green-600/40 border-2 border-green-400 ring-2 ring-green-400/30'
                        : 'bg-gray-900/50 border border-gray-700 hover:border-indigo-500'
                    }`}
                  >
                    <div className="text-sm font-medium text-white mb-1">Minimal</div>
                    <div className="text-xs text-gray-400">Texte uniquement, léger</div>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">Simple</span>
                  </button>

                  {/* Template Modern */}
                  <button
                    type="button"
                    onClick={() => handleSignatureChange(signatureTemplates.modern)}
                    className={`p-3 rounded-lg transition-colors text-left ${
                      formData.email_signature === signatureTemplates.modern
                        ? 'bg-green-600/40 border-2 border-green-400 ring-2 ring-green-400/30'
                        : 'bg-gray-900/50 border border-gray-700 hover:border-indigo-500'
                    }`}
                  >
                    <div className="text-sm font-medium text-white mb-1">Modern</div>
                    <div className="text-xs text-gray-400">Bordure latérale, startup</div>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">Tendance</span>
                  </button>

                  {/* Template Classic */}
                  <button
                    type="button"
                    onClick={() => handleSignatureChange(signatureTemplates.classic)}
                    className={`p-3 rounded-lg transition-colors text-left ${
                      formData.email_signature === signatureTemplates.classic
                        ? 'bg-green-600/40 border-2 border-green-400 ring-2 ring-green-400/30'
                        : 'bg-gray-900/50 border border-gray-700 hover:border-indigo-500'
                    }`}
                  >
                    <div className="text-sm font-medium text-white mb-1">Classic</div>
                    <div className="text-xs text-gray-400">Logo à gauche, classique</div>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">Universel</span>
                  </button>
                </div>
              </div>

              {/* Prévisualisation */}
              {formData.email_signature && (
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Prévisualisation
                  </label>
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 overflow-auto">
                    <div
                      style={{ display: 'flow-root' }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formData.email_signature) }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'video' && (
          <VideoConferenceSettings />
        )}

        {activeTab === 'reminders' && (
          <ReminderSettings />
        )}

        {activeTab === 'appearance' && (
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Thème de l'interface</h2>
            <p className="text-gray-400 text-sm mb-6">Choisissez l'apparence du CRM. Votre choix est mémorisé sur cet appareil.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  theme === 'dark' ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center text-white">
                  <FiMoon />
                </div>
                <div>
                  <div className="text-white font-medium">Sombre</div>
                  <div className="text-gray-400 text-xs">Thème par défaut</div>
                </div>
                {theme === 'dark' && <FiCheckCircle className="ml-auto text-indigo-400" />}
              </button>

              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  theme === 'light' ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-700" style={{ background: 'linear-gradient(to bottom right, #ffffff, #f1f0ee)', border: '1px solid #e9e9e7' }}>
                  <FiSun />
                </div>
                <div>
                  <div className="text-white font-medium">Clair</div>
                  <div className="text-gray-400 text-xs">Style Notion</div>
                </div>
                {theme === 'light' && <FiCheckCircle className="ml-auto text-indigo-400" />}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Settings;
