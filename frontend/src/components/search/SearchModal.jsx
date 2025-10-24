// src/components/search/SearchModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FiSearch,
  FiX,
  FiUser,
  FiBriefcase,
  FiTarget,
  FiActivity,
  FiUsers,
  FiLoader
} from 'react-icons/fi';
import { searchAPI } from '../../services/api';

const SearchModal = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Focus automatique sur l'input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce pour la recherche
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const data = await searchAPI.global(query);
        setResults(data);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Erreur lors de la recherche:', error);
        setResults({ leads: [], projects: [], goals: [], activities: [], contacts: [], total: 0 });
      } finally {
        setIsLoading(false);
      }
    }, 300); // Délai de 300ms

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Configuration des icônes et couleurs par type
  const entityConfig = {
    leads: {
      icon: <FiUser />,
      label: 'Leads',
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      border: 'border-purple-500/30',
      path: '/leads'
    },
    projects: {
      icon: <FiBriefcase />,
      label: 'Projets',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      border: 'border-blue-500/30',
      path: '/projects'
    },
    goals: {
      icon: <FiTarget />,
      label: 'Objectifs',
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/30',
      path: '/goals'
    },
    activities: {
      icon: <FiActivity />,
      label: 'Activités',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      border: 'border-green-500/30',
      path: '/activities'
    },
    contacts: {
      icon: <FiUsers />,
      label: 'Contacts',
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/20',
      border: 'border-indigo-500/30',
      path: '/leads'
    }
  };

  // Obtenir tous les résultats sous forme de liste plate
  const getAllResults = () => {
    if (!results) return [];
    const all = [];
    Object.keys(entityConfig).forEach(type => {
      if (results[type]?.length > 0) {
        results[type].forEach(item => {
          all.push({ type, item });
        });
      }
    });
    return all;
  };

  const allResults = getAllResults();

  // Navigation au clavier
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(allResults.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + allResults.length) % Math.max(allResults.length, 1));
      } else if (e.key === 'Enter' && allResults[selectedIndex]) {
        e.preventDefault();
        handleSelectResult(allResults[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allResults, selectedIndex]);

  // Gérer la sélection d'un résultat
  const handleSelectResult = (result) => {
    const config = entityConfig[result.type];

    // Navigation selon le type
    if (result.type === 'contacts') {
      // Pour les contacts, aller vers le lead parent
      navigate(`${config.path}?leadId=${result.item.lead_id}`);
    } else {
      navigate(`${config.path}?id=${result.item.id}`);
    }

    onClose();
  };

  // Obtenir le nom affiché pour une entité
  const getDisplayName = (type, item) => {
    if (type === 'leads' || type === 'projects' || type === 'goals' || type === 'contacts') {
      return item.name;
    }
    if (type === 'activities') {
      return item.description;
    }
    return '';
  };

  // Obtenir les infos secondaires
  const getSecondaryInfo = (type, item) => {
    if (type === 'leads') {
      return item.company || item.email;
    }
    if (type === 'projects') {
      return item.status;
    }
    if (type === 'goals') {
      return `${item.category} • ${item.current_value}/${item.target_value}`;
    }
    if (type === 'activities') {
      return `${item.type} • ${new Date(item.date).toLocaleDateString('fr-FR')}`;
    }
    if (type === 'contacts') {
      return `${item.position || ''} ${item.lead_name ? `• ${item.lead_name}` : ''}`;
    }
    return '';
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center z-50 p-4 pt-20 sm:pt-32"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-gradient-to-br from-gray-900 via-purple-900/40 to-indigo-900/40 border border-purple-500/30 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl"
        initial={{ scale: 0.9, y: -20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: -20 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barre de recherche */}
        <div className="p-4 sm:p-6 border-b border-purple-500/20">
          <div className="flex items-center gap-3">
            <FiSearch className="text-2xl text-indigo-300 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans leads, projets, objectifs..."
              className="flex-1 bg-transparent text-white text-lg placeholder-gray-400 focus:outline-none"
            />
            {isLoading && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <FiLoader className="text-xl text-indigo-400" />
              </motion.div>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800/50 rounded-lg transition-colors flex-shrink-0"
            >
              <FiX className="text-xl text-gray-400" />
            </button>
          </div>

          {/* Raccourci clavier */}
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <span>Utilisez</span>
            <kbd className="px-2 py-1 bg-gray-800/50 border border-gray-700 rounded">↑↓</kbd>
            <span>pour naviguer</span>
            <kbd className="px-2 py-1 bg-gray-800/50 border border-gray-700 rounded">Enter</kbd>
            <span>pour sélectionner</span>
            <kbd className="px-2 py-1 bg-gray-800/50 border border-gray-700 rounded">Esc</kbd>
            <span>pour fermer</span>
          </div>
        </div>

        {/* Résultats */}
        <div className="max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {query.trim().length < 2 ? (
              <motion.div
                key="empty"
                className="p-8 sm:p-12 text-center text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <FiSearch className="text-5xl mx-auto mb-4 opacity-50" />
                <p className="text-lg">Tapez au moins 2 caractères pour rechercher</p>
              </motion.div>
            ) : results && results.total === 0 ? (
              <motion.div
                key="no-results"
                className="p-8 sm:p-12 text-center text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <FiSearch className="text-5xl mx-auto mb-4 opacity-50" />
                <p className="text-lg">Aucun résultat trouvé pour "{query}"</p>
              </motion.div>
            ) : results && allResults.length > 0 ? (
              <motion.div
                key="results"
                className="p-2 sm:p-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {Object.keys(entityConfig).map(type => {
                  if (!results[type] || results[type].length === 0) return null;
                  const config = entityConfig[type];

                  return (
                    <div key={type} className="mb-4">
                      {/* Header de catégorie */}
                      <div className="px-3 py-2 flex items-center gap-2">
                        <span className={`${config.color} text-lg`}>{config.icon}</span>
                        <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
                          {config.label} ({results[type].length})
                        </h3>
                      </div>

                      {/* Items */}
                      <div className="space-y-1">
                        {results[type].map((item, idx) => {
                          const globalIndex = allResults.findIndex(
                            r => r.type === type && r.item.id === item.id
                          );
                          const isSelected = globalIndex === selectedIndex;

                          return (
                            <motion.button
                              key={item.id}
                              className={`w-full text-left px-3 py-3 rounded-lg transition-all ${
                                isSelected
                                  ? `${config.bg} ${config.border} border`
                                  : 'hover:bg-gray-800/30'
                              }`}
                              onClick={() => handleSelectResult({ type, item })}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.02 }}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`${config.color} text-xl mt-0.5 flex-shrink-0`}>
                                  {config.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-white font-medium text-sm sm:text-base truncate">
                                    {getDisplayName(type, item)}
                                  </h4>
                                  {getSecondaryInfo(type, item) && (
                                    <p className="text-gray-400 text-xs sm:text-sm mt-0.5 truncate">
                                      {getSecondaryInfo(type, item)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SearchModal;
