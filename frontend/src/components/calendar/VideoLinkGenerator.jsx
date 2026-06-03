import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiVideo, FiRefreshCw, FiExternalLink, FiCheck, FiX, FiUsers, FiLink } from 'react-icons/fi';

const VideoLinkGenerator = ({ value, onChange, eventData }) => {
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

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
        if (data && data.providers && Array.isArray(data.providers)) {
          setProviders(data.providers.filter(p => p.enabled));
        } else {
          setProviders([]);
        }
        setSelectedProvider(data?.default_provider || null);
        setAutoGenerate(data?.auto_generate || false);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des providers:', error);
    }
  };

  const generateSimpleLink = async () => {
    if (!selectedProvider) {
      alert('Veuillez sélectionner un provider');
      return;
    }

    setIsGenerating(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/video-conference/generate-simple', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: eventData,
          provider: selectedProvider
        })
      });

      if (response.ok) {
        const data = await response.json();
        onChange(data.video_link, selectedProvider, data.video_meeting_id);
        setShowProviders(false);
      } else {
        alert('Erreur lors de la génération du lien');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la génération du lien');
    } finally {
      setIsGenerating(false);
    }
  };

  const getProviderInfo = (providerId) => {
    const info = {
      google_meet: {
        name: 'Google Meet',
        icon: <FiVideo />,
        color: 'green'
      },
      zoom: {
        name: 'Zoom',
        icon: <FiVideo />,
        color: 'blue'
      },
      teams: {
        name: 'Microsoft Teams',
        icon: <FiUsers />,
        color: 'purple'
      }
    };
    return info[providerId] || { name: providerId, icon: <FiLink />, color: 'gray' };
  };

  // Mapping statique pour les classes Tailwind (nécessaire pour le JIT compiler)
  const getProviderClasses = (color) => {
    const colorClasses = {
      green: 'border-green-500 bg-green-500/10',
      blue: 'border-blue-500 bg-blue-500/10',
      purple: 'border-purple-500 bg-purple-500/10',
      gray: 'border-gray-500 bg-gray-500/10'
    };
    return colorClasses[color] || colorClasses.gray;
  };

  const currentProviderInfo = selectedProvider ? getProviderInfo(selectedProvider) : null;

  return (
    <div className="space-y-3">
      {/* Champ de lien manuel */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Lien de visioconférence
        </label>
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <input
              type="url"
              value={value || ''}
              onChange={(e) => onChange(e.target.value, null, null)}
              placeholder="https://meet.google.com/abc-defg-hij ou générer automatiquement"
              className="w-full px-3 py-2 pl-10 bg-gray-700/50 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FiVideo className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          {value && (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center"
              title="Ouvrir le lien"
            >
              <FiExternalLink />
            </a>
          )}

          {value && (
            <button
              type="button"
              onClick={() => onChange('', null, null)}
              className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center"
              title="Supprimer le lien"
            >
              <FiX />
            </button>
          )}
        </div>
      </div>

      {/* Bouton de génération automatique */}
      {providers.length > 0 && (
        <div>
          {!showProviders ? (
            <button
              type="button"
              onClick={() => setShowProviders(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 text-sm"
            >
              <FiVideo />
              <span>Générer un lien automatiquement</span>
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">
                  Choisir la plateforme
                </span>
                <button
                  type="button"
                  onClick={() => setShowProviders(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <FiX />
                </button>
              </div>

              {/* Liste des providers */}
              <div className="space-y-2">
                {providers.map((provider) => {
                  const info = getProviderInfo(provider.id);
                  return (
                    <label
                      key={provider.id}
                      className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedProvider === provider.id
                          ? getProviderClasses(info.color)
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="video_provider"
                        value={provider.id}
                        checked={selectedProvider === provider.id}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex items-center space-x-3 flex-1">
                        <span className="text-2xl">{info.icon}</span>
                        <div>
                          <div className="font-medium text-white">
                            {info.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {provider.description}
                          </div>
                        </div>
                      </div>
                      {selectedProvider === provider.id && (
                        <FiCheck className="text-green-500" />
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Bouton de génération */}
              <button
                type="button"
                onClick={generateSimpleLink}
                disabled={isGenerating || !selectedProvider}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Génération...</span>
                  </>
                ) : (
                  <>
                    <FiRefreshCw />
                    <span>Générer le lien</span>
                  </>
                )}
              </button>

              {/* Info */}
              <div className="text-xs text-gray-400 text-center">
                Un lien de visioconférence sera créé automatiquement
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Message si aucun provider configuré */}
      {providers.length === 0 && (
        <div className="text-xs text-gray-400 mt-1">
          Aucun service de visioconférence configuré.{' '}
          <a href="/settings" className="text-blue-400 hover:underline">
            Configurer dans les paramètres
          </a>
        </div>
      )}
    </div>
  );
};

export default VideoLinkGenerator;
