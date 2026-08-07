// src/components/common/CompanyAutocomplete.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBriefcase, FiSearch, FiCheck } from 'react-icons/fi';
import { searchCompanies, getCompanyDetails } from '../../services/externalAPI';

/**
 * Composant d'auto-complétion pour les entreprises via l'API Sirene
 *
 * @param {string} value - Valeur actuelle du champ
 * @param {function} onChange - Callback appelé quand la valeur change
 * @param {function} onSelect - Callback appelé quand une entreprise est sélectionnée (reçoit les détails complets)
 * @param {string} placeholder - Texte du placeholder
 * @param {string} error - Message d'erreur à afficher
 */
const CompanyAutocomplete = ({
  value,
  onChange,
  onSelect,
  placeholder = "Rechercher une entreprise...",
  error = null
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Recherche avec debounce (attendre 300ms après la dernière frappe)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value && value.length >= 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        const results = await searchCompanies(value);
        setSuggestions(results);
        setShowDropdown(true);
        setIsLoading(false);
      }, 300);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [value]);

  // Fermer le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sélection d'une entreprise
  const handleSelectCompany = async (company) => {
    onChange(company.name);
    setShowDropdown(false);
    setSuggestions([]);

    // Récupérer les détails complets de l'entreprise
    if (onSelect && company.siren) {
      const details = await getCompanyDetails(company.siren);
      if (details) {
        onSelect(details);
      }
    }
  };

  // Navigation au clavier
  const handleKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectCompany(suggestions[selectedIndex]);
        }
        break;

      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;

      default:
        break;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Input avec icône de recherche */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent"></div>
          ) : (
            <FiSearch />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          className={`w-full pl-10 pr-4 py-2 bg-surface-muted/50 border ${
            error ? 'border-red-500' : 'border-border'
          } rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors`}
        />
      </div>

      {/* Message d'erreur */}
      {error && (
        <p className="mt-1 text-red-400 text-sm">{error}</p>
      )}

      {/* Dropdown des suggestions */}
      <AnimatePresence>
        {showDropdown && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 w-full mt-2 bg-surface border border-border rounded-lg shadow-xl max-h-80 overflow-y-auto"
          >
            {suggestions.map((company, index) => (
              <motion.div
                key={company.siren}
                onClick={() => handleSelectCompany(company)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`p-4 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 ${
                  selectedIndex === index
                    ? 'bg-indigo-600/20 border-l-4 border-l-indigo-500'
                    : 'hover:bg-surface-strong/50'
                }`}
                whileHover={{ x: 4 }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-indigo-600/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <FiBriefcase className="text-indigo-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Nom de l'entreprise */}
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-text-primary truncate">
                        {company.name}
                      </h4>
                      {selectedIndex === index && (
                        <FiCheck className="text-indigo-400 flex-shrink-0" />
                      )}
                    </div>

                    {/* Informations complémentaires */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {company.legalForm && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                          {company.legalForm}
                        </span>
                      )}

                      {company.activityLabel && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                          {company.activityLabel}
                        </span>
                      )}

                      {company.employees && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
                          {company.employees}
                        </span>
                      )}
                    </div>

                    {/* SIREN */}
                    <div className="text-xs text-text-muted mt-1">
                      SIREN: {company.siren}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message "Aucun résultat" */}
      {showDropdown && !isLoading && value.length >= 2 && suggestions.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute z-50 w-full mt-2 bg-surface border border-border rounded-lg p-4 text-center"
        >
          <p className="text-text-muted text-sm">
            Aucune entreprise trouvée pour "{value}"
          </p>
          <p className="text-text-muted text-xs mt-1">
            Vérifiez l'orthographe ou essayez une recherche plus générale
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default CompanyAutocomplete;
