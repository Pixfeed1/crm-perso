// src/components/search/GlobalSearch.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FiSearch,
  FiUser,
  FiBriefcase,
  FiCalendar,
  FiTarget,
  FiActivity,
  FiDollarSign,
  FiX,
  FiLoader,
  FiClock,
  FiTrendingUp
} from 'react-icons/fi';

/**
 * Composant GlobalSearch - Recherche universelle dans tous les modules
 * Accessible via Ctrl+K ou Cmd+K
 */
const GlobalSearch = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Charger les recherches récentes depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Erreur lors du chargement des recherches récentes:', e);
      }
    }
  }, []);

  // Focus automatique sur l'input quand le modal s'ouvre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Sauvegarder une recherche récente
  const saveRecentSearch = (searchQuery) => {
    if (!searchQuery.trim()) return;

    const updated = [
      searchQuery,
      ...recentSearches.filter(s => s !== searchQuery)
    ].slice(0, 5); // Garder seulement les 5 dernières

    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  // Recherche avec debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      await performSearch(query);
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Fonction de recherche principale
  const performSearch = async (searchQuery) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setResults(formatResults(data));
      } else {
        console.error('Erreur lors de la recherche:', response.statusText);
        setResults([]);
      }
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Formater les résultats pour l'affichage
  const formatResults = (data) => {
    const formatted = [];

    // Leads
    if (data.leads && data.leads.length > 0) {
      formatted.push({
        category: 'Leads',
        icon: <FiUser />,
        color: 'blue',
        items: data.leads.map(lead => ({
          id: lead.id,
          title: lead.name,
          subtitle: lead.company || lead.email,
          path: '/leads',
          type: 'lead',
          status: lead.status,
          metadata: `${lead.email}${lead.phone ? ' • ' + lead.phone : ''}`
        }))
      });
    }

    // Projects
    if (data.projects && data.projects.length > 0) {
      formatted.push({
        category: 'Projets',
        icon: <FiBriefcase />,
        color: 'purple',
        items: data.projects.map(project => ({
          id: project.id,
          title: project.name,
          subtitle: project.description,
          path: '/projects',
          type: 'project',
          status: project.status,
          metadata: `Budget: ${project.budget}€ • ${project.status}`
        }))
      });
    }

    // Activities
    if (data.activities && data.activities.length > 0) {
      formatted.push({
        category: 'Activités',
        icon: <FiActivity />,
        color: 'amber',
        items: data.activities.map(activity => ({
          id: activity.id,
          title: activity.title,
          subtitle: activity.description,
          path: '/activities',
          type: 'activity',
          status: activity.status,
          metadata: `${activity.activity_type} • ${new Date(activity.due_date).toLocaleDateString()}`
        }))
      });
    }

    // Goals
    if (data.goals && data.goals.length > 0) {
      formatted.push({
        category: 'Objectifs',
        icon: <FiTarget />,
        color: 'rose',
        items: data.goals.map(goal => ({
          id: goal.id,
          title: goal.name,
          subtitle: goal.description,
          path: '/goals',
          type: 'goal',
          status: goal.status,
          metadata: `${goal.current_value}/${goal.target_value} ${goal.metric_unit || ''}`
        }))
      });
    }

    // Revenues
    if (data.revenues && data.revenues.length > 0) {
      formatted.push({
        category: 'Revenus',
        icon: <FiDollarSign />,
        color: 'emerald',
        items: data.revenues.map(revenue => ({
          id: revenue.id,
          title: `${revenue.amount}€`,
          subtitle: revenue.description,
          path: '/revenues',
          type: 'revenue',
          status: revenue.status,
          metadata: `${revenue.source} • ${new Date(revenue.date).toLocaleDateString()}`
        }))
      });
    }

    return formatted;
  };

  // Compter le nombre total de résultats
  const totalResults = useMemo(() => {
    return results.reduce((sum, category) => sum + category.items.length, 0);
  }, [results]);

  // Navigation au clavier
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, totalResults - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelectResult(getSelectedResult());
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, totalResults, results]);

  // Obtenir le résultat sélectionné
  const getSelectedResult = () => {
    let index = 0;
    for (const category of results) {
      for (const item of category.items) {
        if (index === selectedIndex) {
          return item;
        }
        index++;
      }
    }
    return null;
  };

  // Gérer la sélection d'un résultat
  const handleSelectResult = (item) => {
    if (!item) return;

    saveRecentSearch(query);
    navigate(item.path);
    onClose();
    setQuery('');
  };

  // Gérer le clic sur une recherche récente
  const handleRecentSearch = (searchQuery) => {
    setQuery(searchQuery);
  };

  // Effacer les recherches récentes
  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  // Configuration des couleurs par catégorie
  const colorConfig = {
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        {/* Modal de recherche */}
        <motion.div
          className="relative w-full max-w-2xl bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700 overflow-hidden"
          initial={{ scale: 0.9, y: -20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: -20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header avec input */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-700">
            <FiSearch className="w-5 h-5 text-indigo-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans tous les modules..."
              className="flex-1 bg-transparent text-white placeholder-gray-400 outline-none text-lg"
            />
            {isLoading && (
              <FiLoader className="w-5 h-5 text-indigo-400 animate-spin" />
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <FiX className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Résultats */}
          <div className="max-h-[60vh] overflow-y-auto">
            {/* Recherches récentes (quand pas de query) */}
            {!query && recentSearches.length > 0 && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <FiClock className="w-4 h-4" />
                    <span>Recherches récentes</span>
                  </div>
                  <button
                    onClick={clearRecentSearches}
                    className="text-xs text-gray-500 hover:text-gray-400"
                  >
                    Effacer
                  </button>
                </div>
                <div className="space-y-2">
                  {recentSearches.map((recent, idx) => (
                    <motion.button
                      key={idx}
                      onClick={() => handleRecentSearch(recent)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800/50 text-gray-300 transition-colors"
                      whileHover={{ x: 4 }}
                    >
                      {recent}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Message quand pas de résultats */}
            {query && !isLoading && results.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                <FiSearch className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Aucun résultat pour "{query}"</p>
                <p className="text-sm mt-2">Essayez avec d'autres mots-clés</p>
              </div>
            )}

            {/* Affichage des résultats par catégorie */}
            {results.length > 0 && (
              <div className="p-4 space-y-4">
                {/* Compteur de résultats */}
                <div className="text-sm text-gray-400 pb-2 border-b border-gray-800">
                  {totalResults} résultat{totalResults > 1 ? 's' : ''} trouvé{totalResults > 1 ? 's' : ''}
                </div>

                {results.map((category, catIndex) => {
                  let itemIndex = 0;
                  // Calculer l'index de départ pour cette catégorie
                  for (let i = 0; i < catIndex; i++) {
                    itemIndex += results[i].items.length;
                  }

                  return (
                    <div key={category.category}>
                      {/* En-tête de catégorie */}
                      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-400">
                        <span className={`p-1 rounded ${colorConfig[category.color]}`}>
                          {category.icon}
                        </span>
                        <span>{category.category}</span>
                        <span className="text-xs opacity-60">({category.items.length})</span>
                      </div>

                      {/* Items de la catégorie */}
                      <div className="space-y-1">
                        {category.items.map((item, idx) => {
                          const currentIndex = itemIndex + idx;
                          const isSelected = currentIndex === selectedIndex;

                          return (
                            <motion.button
                              key={item.id}
                              onClick={() => handleSelectResult(item)}
                              className={`w-full text-left p-3 rounded-lg transition-all ${
                                isSelected
                                  ? `bg-gradient-to-r from-${category.color}-500/20 to-transparent border border-${category.color}-500/30`
                                  : 'hover:bg-gray-800/50 border border-transparent'
                              }`}
                              whileHover={{ x: 4 }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="text-white font-medium truncate">
                                    {item.title}
                                  </div>
                                  {item.subtitle && (
                                    <div className="text-sm text-gray-400 truncate mt-1">
                                      {item.subtitle}
                                    </div>
                                  )}
                                  {item.metadata && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {item.metadata}
                                    </div>
                                  )}
                                </div>
                                {item.status && (
                                  <span className={`text-xs px-2 py-1 rounded ${colorConfig[category.color]}`}>
                                    {item.status}
                                  </span>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer avec raccourcis clavier */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-t border-gray-700 text-xs text-gray-400">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <kbd className="px-2 py-1 bg-gray-700 rounded">↑↓</kbd>
                <span>Naviguer</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-2 py-1 bg-gray-700 rounded">Enter</kbd>
                <span>Sélectionner</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-2 py-1 bg-gray-700 rounded">Esc</kbd>
                <span>Fermer</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <FiTrendingUp className="w-3 h-3" />
              <span>Recherche universelle</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default GlobalSearch;
