import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiVideo,
  FiCheck,
  FiX,
  FiSettings,
  FiExternalLink,
  FiAlertCircle,
  FiUsers,
  FiLink
} from 'react-icons/fi';

const VideoConferenceSettings = () => {
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadSettings();
    loadProviders();
  }, []);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/video-conference/settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProviders = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/video-conference/providers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des providers:', error);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/video-conference/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setMessage({ type: 'success', text: 'Paramètres enregistrés avec succès' });
        loadProviders(); // Recharger les providers pour mettre à jour le statut
      } else {
        setMessage({ type: 'error', text: 'Erreur lors de l\'enregistrement' });
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      setMessage({ type: 'error', text: 'Erreur serveur' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleProviderToggle = (providerId) => {
    setSettings(prev => ({
      ...prev,
      [`${providerId}_enabled`]: !prev[`${providerId}_enabled`]
    }));
  };

  const handleDefaultProviderChange = (providerId) => {
    setSettings(prev => ({
      ...prev,
      default_provider: providerId
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center p-8 text-text-muted">
        Impossible de charger les paramètres
      </div>
    );
  }

  const getProviderIcon = (providerId) => {
    const icons = {
      google_meet: <FiVideo />,
      zoom: <FiVideo />,
      teams: <FiUsers />
    };
    return icons[providerId] || <FiLink />;
  };

  const getProviderColor = (providerId) => {
    const colors = {
      google_meet: 'indigo',
      zoom: 'indigo',
      teams: 'purple'
    };
    return colors[providerId] || 'gray';
  };

  // Mapping statique pour les classes Tailwind (nécessaire pour le JIT compiler)
  const getProviderClasses = (providerId) => {
    const colorClasses = {
      google_meet: 'border-indigo-500 bg-indigo-900/20',
      zoom: 'border-indigo-500 bg-indigo-900/20',
      teams: 'border-purple-500 bg-purple-900/20'
    };
    return colorClasses[providerId] || 'border-gray-500 bg-surface-muted/20';
  };

  return (
    <div className="bg-surface/30 rounded-lg border border-border/50 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-900/30 rounded-lg flex items-center justify-center">
            <FiVideo className="text-indigo-400 text-xl" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-secondary">
              Visioconférence
            </h3>
            <p className="text-sm text-text-muted">
              Configurez vos liens de visio automatiques
            </p>
          </div>
        </div>
      </div>

      {/* Message de succès/erreur */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-lg flex items-center space-x-3 ${
            message.type === 'success'
              ? 'bg-green-900/20 border border-green-700'
              : 'bg-red-900/20 border border-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <FiCheck className="text-green-400" />
          ) : (
            <FiAlertCircle className="text-red-400" />
          )}
          <span
            className={
              message.type === 'success' ? 'text-green-300' : 'text-red-300'
            }
          >
            {message.text}
          </span>
        </motion.div>
      )}

      {/* Auto-génération */}
      <div className="bg-surface-muted/50 border border-border/50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-text-secondary">
              Génération automatique
            </h4>
            <p className="text-sm text-text-muted mt-1">
              Créer automatiquement un lien visio pour chaque nouvel événement
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.auto_generate}
              onChange={(e) =>
                setSettings({ ...settings, auto_generate: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-strong peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>
      </div>

      {/* Providers disponibles */}
      <div className="bg-surface-muted/50 border border-border/50 rounded-lg p-6">
        <h4 className="font-medium text-text-secondary mb-4">
          Plateformes disponibles
        </h4>

        <div className="space-y-4">
          {providers.map((provider) => (
            <motion.div
              key={provider.id}
              whileHover={{ scale: 1.01 }}
              className={`p-4 border-2 rounded-lg transition-all ${
                settings.default_provider === provider.id
                  ? getProviderClasses(provider.id)
                  : 'border-border hover:border-border-strong'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="text-3xl">
                    {getProviderIcon(provider.id)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h5 className="font-medium text-text-secondary">
                        {provider.name}
                      </h5>
                      {provider.configured && (
                        <span className="px-2 py-0.5 text-xs bg-green-900/30 text-green-400 rounded-full">
                          Configuré
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted mt-1">
                      {provider.description}
                    </p>

                    {/* Configuration requise */}
                    {provider.requiresAuth && !provider.configured && (
                      <div className="mt-2 flex items-center space-x-2 text-xs text-orange-400">
                        <FiAlertCircle />
                        <span>Configuration requise</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Toggle activation */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={() => handleProviderToggle(provider.id)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-strong peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                  </label>

                  {/* Radio pour provider par défaut */}
                  <button
                    onClick={() => handleDefaultProviderChange(provider.id)}
                    disabled={!provider.enabled}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      settings.default_provider === provider.id
                        ? 'border-indigo-600 bg-accent'
                        : 'border-border-strong hover:border-indigo-500'
                    } ${!provider.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {settings.default_provider === provider.id && (
                      <FiCheck className="text-text-primary text-sm" />
                    )}
                  </button>
                </div>
              </div>

              {/* Configuration spécifique */}
              {provider.enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 pt-4 border-t border-border"
                >
                  {provider.id === 'google_meet' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          ID du calendrier Google
                        </label>
                        <input
                          type="text"
                          value={settings.google_calendar_id || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              google_calendar_id: e.target.value
                            })
                          }
                          placeholder="primary ou votre-email@gmail.com"
                          className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-secondary text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-text-muted"
                        />
                      </div>
                    </div>
                  )}

                  {provider.id === 'zoom' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          API Key
                        </label>
                        <input
                          type="password"
                          value={settings.zoom_api_key || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              zoom_api_key: e.target.value
                            })
                          }
                          placeholder="Votre clé API Zoom"
                          className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-secondary text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-text-muted"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          API Secret
                        </label>
                        <input
                          type="password"
                          value={settings.zoom_api_secret || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              zoom_api_secret: e.target.value
                            })
                          }
                          placeholder="Votre secret API Zoom"
                          className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-secondary text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-text-muted"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          User ID (optionnel)
                        </label>
                        <input
                          type="text"
                          value={settings.zoom_user_id || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              zoom_user_id: e.target.value
                            })
                          }
                          placeholder="me ou votre user ID"
                          className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-secondary text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-text-muted"
                        />
                      </div>
                    </div>
                  )}

                  {provider.id === 'teams' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Tenant ID
                        </label>
                        <input
                          type="text"
                          value={settings.teams_tenant_id || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              teams_tenant_id: e.target.value
                            })
                          }
                          placeholder="Votre Tenant ID Microsoft"
                          className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-secondary text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-text-muted"
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Paramètres par défaut */}
      <div className="bg-surface-muted/50 border border-border/50 rounded-lg p-6">
        <h4 className="font-medium text-text-secondary mb-4">
          Paramètres par défaut des réunions
        </h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Durée par défaut (minutes)
            </label>
            <input
              type="number"
              value={settings.default_duration}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  default_duration: parseInt(e.target.value)
                })
              }
              min="15"
              max="480"
              step="15"
              className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-secondary focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              Autoriser l'entrée avant l'hôte
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.default_join_before_host}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_join_before_host: e.target.checked
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-strong peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Salle d'attente</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.default_waiting_room}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_waiting_room: e.target.checked
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-strong peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              Enregistrement automatique
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.default_recording}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_recording: e.target.checked
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-strong peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Bouton d'enregistrement */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Enregistrement...</span>
            </>
          ) : (
            <>
              <FiCheck />
              <span>Enregistrer les paramètres</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default VideoConferenceSettings;
