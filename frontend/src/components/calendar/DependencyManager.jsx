import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiLink, FiPlus, FiX, FiAlertCircle } from 'react-icons/fi';

const DependencyManager = ({ eventId, allEvents }) => {
  const [dependencies, setDependencies] = useState({ outgoing: [], incoming: [] });
  const [isAdding, setIsAdding] = useState(false);
  const [selectedTargetEvent, setSelectedTargetEvent] = useState('');
  const [dependencyType, setDependencyType] = useState('finish_to_start');
  const [lagDays, setLagDays] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (eventId) {
      loadDependencies();
    }
  }, [eventId]);

  const loadDependencies = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/events/${eventId}/dependencies`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDependencies(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des dépendances:', error);
    }
  };

  const handleAddDependency = async () => {
    if (!selectedTargetEvent) return;

    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/events/${eventId}/dependencies`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_event_id: parseInt(selectedTargetEvent),
          dependency_type: dependencyType,
          lag_days: parseInt(lagDays)
        })
      });

      if (response.ok) {
        await loadDependencies();
        setIsAdding(false);
        setSelectedTargetEvent('');
        setLagDays(0);
      } else {
        const data = await response.json();
        setError(data.message || 'Erreur lors de l\'ajout de la dépendance');
      }
    } catch (error) {
      console.error('Erreur:', error);
      setError('Erreur lors de l\'ajout de la dépendance');
    }
  };

  const handleRemoveDependency = async (dependencyId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/events/dependencies/${dependencyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadDependencies();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  };

  const dependencyTypeLabels = {
    'finish_to_start': 'Fin → Début',
    'start_to_start': 'Début → Début',
    'finish_to_finish': 'Fin → Fin',
    'start_to_finish': 'Début → Fin'
  };

  const availableEvents = allEvents.filter(e => e.id !== eventId);

  if (!eventId) {
    return (
      <div className="text-text-muted text-sm p-4 text-center">
        Enregistrez l'événement pour gérer les dépendances
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FiLink className="text-accent" />
          <h4 className="text-text-primary font-medium">Dépendances</h4>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="px-3 py-1 bg-accent text-white rounded hover:bg-accent-hover transition-colors text-sm flex items-center space-x-1"
          >
            <FiPlus className="text-xs" />
            <span>Ajouter</span>
          </button>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-danger-bg border border-danger-text rounded p-3 flex items-center space-x-2"
        >
          <FiAlertCircle className="text-danger-text" />
          <span className="text-danger-text text-sm">{error}</span>
        </motion.div>
      )}

      {/* Formulaire d'ajout */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-surface rounded-lg p-4 space-y-3"
          >
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Événement cible
              </label>
              <select
                value={selectedTargetEvent}
                onChange={(e) => setSelectedTargetEvent(e.target.value)}
                className="w-full px-3 py-2 bg-surface-strong border border-border-strong text-text-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Sélectionner un événement</option>
                {availableEvents.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Type de dépendance
              </label>
              <select
                value={dependencyType}
                onChange={(e) => setDependencyType(e.target.value)}
                className="w-full px-3 py-2 bg-surface-strong border border-border-strong text-text-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="finish_to_start">Fin → Début (standard)</option>
                <option value="start_to_start">Début → Début</option>
                <option value="finish_to_finish">Fin → Fin</option>
                <option value="start_to_finish">Début → Fin</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Décalage (jours)
              </label>
              <input
                type="number"
                value={lagDays}
                onChange={(e) => setLagDays(e.target.value)}
                className="w-full px-3 py-2 bg-surface-strong border border-border-strong text-text-primary rounded focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="0"
              />
            </div>

            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setError(null);
                }}
                className="px-3 py-2 text-text-secondary hover:bg-surface-strong rounded transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleAddDependency}
                disabled={!selectedTargetEvent}
                className="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ajouter
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Liste des dépendances sortantes */}
      {dependencies.outgoing.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-text-muted text-sm font-medium">Bloque ces événements :</h5>
          {dependencies.outgoing.map((dep) => (
            <motion.div
              key={dep.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-surface rounded p-3 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="text-text-primary text-sm">{dep.target_title || 'Événement sans titre'}</div>
                <div className="text-text-muted text-xs mt-1">
                  {dep.dependency_type ? dependencyTypeLabels[dep.dependency_type] : 'Type non défini'}
                  {dep.lag_days && dep.lag_days !== 0 && ` (${dep.lag_days > 0 ? '+' : ''}${dep.lag_days} jours)`}
                </div>
              </div>
              <button
                onClick={() => handleRemoveDependency(dep.id)}
                className="p-2 text-text-muted hover:text-danger-text hover:bg-surface-strong rounded transition-colors"
              >
                <FiX />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Liste des dépendances entrantes */}
      {dependencies.incoming.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-text-muted text-sm font-medium">Bloqué par ces événements :</h5>
          {dependencies.incoming.map((dep) => (
            <motion.div
              key={dep.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-surface rounded p-3"
            >
              <div className="text-text-primary text-sm">{dep.source_title || 'Événement sans titre'}</div>
              <div className="text-text-muted text-xs mt-1">
                {dep.dependency_type ? dependencyTypeLabels[dep.dependency_type] : 'Type non défini'}
                {dep.lag_days && dep.lag_days !== 0 && ` (${dep.lag_days > 0 ? '+' : ''}${dep.lag_days} jours)`}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Message si aucune dépendance */}
      {dependencies.outgoing.length === 0 && dependencies.incoming.length === 0 && !isAdding && (
        <div className="text-text-muted text-sm text-center py-4">
          Aucune dépendance définie
        </div>
      )}
    </div>
  );
};

export default DependencyManager;
