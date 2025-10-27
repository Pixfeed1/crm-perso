// src/components/calendar/CalendarSync.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiRefreshCw, FiX, FiCheck, FiAlertCircle, FiSettings } from 'react-icons/fi';
import { FaGoogle } from 'react-icons/fa';
import { SiMicrosoftoutlook } from 'react-icons/si';
import { useToast } from '../../hooks/useToast';
import axios from 'axios';

const CalendarSync = ({ isOpen, onClose }) => {
  const [connections, setConnections] = useState([]);
  const [syncLogs, setSyncLogs] = useState({});
  const [syncing, setSyncing] = useState({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Charger les connexions
  useEffect(() => {
    if (isOpen) {
      loadConnections();
    }
  }, [isOpen]);

  const loadConnections = async () => {
    try {
      const response = await axios.get('/api/calendar-sync/connections');
      setConnections(response.data);

      // Charger les logs pour chaque connexion
      for (const conn of response.data) {
        loadSyncLogs(conn.id);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des connexions:', error);
      toast.error('Impossible de charger les connexions');
    } finally {
      setLoading(false);
    }
  };

  const loadSyncLogs = async (connectionId) => {
    try {
      const response = await axios.get(`/api/calendar-sync/logs/${connectionId}?limit=5`);
      setSyncLogs(prev => ({ ...prev, [connectionId]: response.data }));
    } catch (error) {
      console.error('Erreur lors du chargement des logs:', error);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const response = await axios.get('/api/calendar-sync/google/auth');
      // Ouvrir la fenêtre d'authentification Google
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Erreur lors de la connexion Google:', error);
      toast.error('Impossible de se connecter à Google Calendar');
    }
  };

  const handleConnectOutlook = async () => {
    try {
      const response = await axios.get('/api/calendar-sync/outlook/auth');
      // Ouvrir la fenêtre d'authentification Outlook
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Erreur lors de la connexion Outlook:', error);
      toast.error('Impossible de se connecter à Outlook');
    }
  };

  const handleDisconnect = async (connectionId, provider) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir déconnecter ${provider === 'google' ? 'Google Calendar' : 'Outlook'} ?`)) {
      return;
    }

    try {
      await axios.delete(`/api/calendar-sync/connections/${connectionId}`);
      toast.success('Calendrier déconnecté');
      loadConnections();
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      toast.error('Impossible de déconnecter le calendrier');
    }
  };

  const handleSync = async (connectionId, provider) => {
    setSyncing(prev => ({ ...prev, [connectionId]: true }));

    try {
      const response = await axios.post(`/api/calendar-sync/sync/${connectionId}`);
      toast.success(`Synchronisation ${provider === 'google' ? 'Google Calendar' : 'Outlook'} terminée`);
      loadSyncLogs(connectionId);
      loadConnections();
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
      toast.error('Erreur lors de la synchronisation');
    } finally {
      setSyncing(prev => ({ ...prev, [connectionId]: false }));
    }
  };

  const getProviderIcon = (provider) => {
    if (provider === 'google') {
      return <FaGoogle className="text-xl" />;
    } else if (provider === 'outlook') {
      return <SiMicrosoftoutlook className="text-xl" />;
    }
  };

  const getProviderName = (provider) => {
    if (provider === 'google') return 'Google Calendar';
    if (provider === 'outlook') return 'Outlook';
    return provider;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Jamais';
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-700"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Synchronisation calendrier</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <FiX className="text-2xl" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <FiRefreshCw className="text-4xl text-indigo-500 animate-spin" />
              </div>
            ) : (
              <>
                {/* Boutons de connexion */}
                {connections.length === 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-200 mb-4">
                      Connecter un calendrier
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <motion.button
                        onClick={handleConnectGoogle}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center justify-center gap-3 bg-white text-gray-800 rounded-lg px-6 py-4 font-semibold hover:shadow-lg transition-all"
                      >
                        <FaGoogle className="text-2xl text-red-500" />
                        <span>Google Calendar</span>
                      </motion.button>

                      <motion.button
                        onClick={handleConnectOutlook}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center justify-center gap-3 bg-blue-600 text-white rounded-lg px-6 py-4 font-semibold hover:shadow-lg transition-all"
                      >
                        <SiMicrosoftoutlook className="text-2xl" />
                        <span>Outlook</span>
                      </motion.button>
                    </div>
                  </div>
                )}

                {/* Connexions actives */}
                {connections.map(connection => (
                  <div key={connection.id} className="mb-6 bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${
                          connection.provider === 'google' ? 'bg-red-500/10' : 'bg-blue-500/10'
                        }`}>
                          {getProviderIcon(connection.provider)}
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-white">
                            {getProviderName(connection.provider)}
                          </h4>
                          <p className="text-sm text-gray-400">{connection.account_email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <motion.button
                          onClick={() => handleSync(connection.id, connection.provider)}
                          disabled={syncing[connection.id]}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Synchroniser maintenant"
                        >
                          <FiRefreshCw className={syncing[connection.id] ? 'animate-spin' : ''} />
                        </motion.button>

                        <motion.button
                          onClick={() => handleDisconnect(connection.id, connection.provider)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                          title="Déconnecter"
                        >
                          <FiX />
                        </motion.button>
                      </div>
                    </div>

                    {/* Statut */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-gray-900/50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Statut</p>
                        <p className="text-sm font-semibold text-green-400 flex items-center gap-1">
                          <FiCheck /> Connecté
                        </p>
                      </div>

                      <div className="bg-gray-900/50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Dernière synchro</p>
                        <p className="text-sm font-semibold text-white">
                          {formatDate(connection.last_sync_at)}
                        </p>
                      </div>

                      <div className="bg-gray-900/50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Direction</p>
                        <p className="text-sm font-semibold text-white capitalize">
                          {connection.sync_direction === 'bidirectional' ? 'Bidirectionnelle' : connection.sync_direction}
                        </p>
                      </div>

                      <div className="bg-gray-900/50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Synchronisation</p>
                        <p className={`text-sm font-semibold ${connection.sync_enabled ? 'text-green-400' : 'text-gray-400'}`}>
                          {connection.sync_enabled ? 'Activée' : 'Désactivée'}
                        </p>
                      </div>
                    </div>

                    {/* Logs récents */}
                    {syncLogs[connection.id] && syncLogs[connection.id].length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold text-gray-300 mb-2">Historique récent</h5>
                        <div className="space-y-2">
                          {syncLogs[connection.id].slice(0, 3).map(log => (
                            <div key={log.id} className="bg-gray-900/50 rounded p-3 text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-gray-400">{formatDate(log.started_at)}</span>
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                  log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                                  log.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {log.status === 'success' ? 'Succès' : log.status === 'partial' ? 'Partiel' : 'Erreur'}
                                </span>
                              </div>
                              <div className="text-gray-300">
                                {log.events_imported > 0 && <span>↓ {log.events_imported} importés</span>}
                                {log.events_imported > 0 && log.events_exported > 0 && <span className="mx-2">•</span>}
                                {log.events_exported > 0 && <span>↑ {log.events_exported} exportés</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Ajouter un autre calendrier */}
                {connections.length > 0 && connections.length < 2 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-gray-200 mb-4">
                      Ajouter un autre calendrier
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {!connections.find(c => c.provider === 'google') && (
                        <motion.button
                          onClick={handleConnectGoogle}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="flex items-center justify-center gap-3 bg-white text-gray-800 rounded-lg px-6 py-4 font-semibold hover:shadow-lg transition-all"
                        >
                          <FaGoogle className="text-2xl text-red-500" />
                          <span>Google Calendar</span>
                        </motion.button>
                      )}

                      {!connections.find(c => c.provider === 'outlook') && (
                        <motion.button
                          onClick={handleConnectOutlook}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="flex items-center justify-center gap-3 bg-blue-600 text-white rounded-lg px-6 py-4 font-semibold hover:shadow-lg transition-all"
                        >
                          <SiMicrosoftoutlook className="text-2xl" />
                          <span>Outlook</span>
                        </motion.button>
                      )}
                    </div>
                  </div>
                )}

                {/* Note informative */}
                <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <FiAlertCircle className="text-blue-400 text-xl flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-gray-300">
                      <p className="font-semibold text-blue-400 mb-1">À propos de la synchronisation</p>
                      <ul className="list-disc list-inside space-y-1 text-gray-400">
                        <li>La synchronisation est bidirectionnelle par défaut</li>
                        <li>Les modifications sont synchronisées automatiquement</li>
                        <li>Vous pouvez synchroniser manuellement à tout moment</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CalendarSync;
