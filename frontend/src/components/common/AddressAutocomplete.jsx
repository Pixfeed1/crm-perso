// src/components/common/AddressAutocomplete.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMapPin, FiSearch, FiCheck } from 'react-icons/fi';
import { searchAddresses } from '../../services/externalAPI';

/**
 * Composant d'auto-complétion pour les adresses françaises via l'API Adresse (data.gouv.fr)
 *
 * @param {string} value - Valeur actuelle du champ
 * @param {function} onChange - Callback appelé quand la valeur change
 * @param {function} onSelect - Callback appelé quand une adresse est sélectionnée (reçoit les détails)
 * @param {string} placeholder - Texte du placeholder
 * @param {string} error - Message d'erreur à afficher
 */
const AddressAutocomplete = ({
  value,
  onChange,
  onSelect,
  placeholder = "Rechercher une adresse...",
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

    if (value && value.length >= 3) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        const results = await searchAddresses(value);
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

  // Sélection d'une adresse
  const handleSelectAddress = (address) => {
    onChange(address.label);
    setShowDropdown(false);
    setSuggestions([]);

    // Appeler le callback avec les détails de l'adresse
    if (onSelect) {
      onSelect({
        address: address.label,
        street: address.street,
        housenumber: address.housenumber,
        postcode: address.postcode,
        city: address.city,
        coordinates: address.coordinates
      });
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
          handleSelectAddress(suggestions[selectedIndex]);
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

  // Calcul du score de pertinence (0-100%)
  const getScorePercentage = (score) => {
    return Math.round(score * 100);
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
            {suggestions.map((address, index) => (
              <motion.div
                key={`${address.label}-${index}`}
                onClick={() => handleSelectAddress(address)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`p-4 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 ${
                  selectedIndex === index
                    ? 'bg-indigo-600/20 border-l-4 border-l-indigo-500'
                    : 'hover:bg-surface-strong/50'
                }`}
                whileHover={{ x: 4 }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <FiMapPin className="text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Adresse complète */}
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-text-primary truncate">
                        {address.name}
                      </h4>
                      {selectedIndex === index && (
                        <FiCheck className="text-indigo-400 flex-shrink-0" />
                      )}
                    </div>

                    {/* Code postal et ville */}
                    <div className="flex items-center gap-2 text-sm text-text-secondary mb-1">
                      <span className="font-medium">{address.postcode}</span>
                      <span className="text-text-muted">•</span>
                      <span>{address.city}</span>
                    </div>

                    {/* Contexte (département, région) */}
                    {address.context && (
                      <div className="text-xs text-text-muted">
                        {address.context}
                      </div>
                    )}

                    {/* Score de pertinence */}
                    {address.score && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-surface-strong rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${getScorePercentage(address.score)}%` }}
                            className={`h-full ${
                              address.score > 0.8
                                ? 'bg-green-500'
                                : address.score > 0.5
                                ? 'bg-yellow-500'
                                : 'bg-orange-500'
                            }`}
                          />
                        </div>
                        <span className="text-xs text-text-muted">
                          {getScorePercentage(address.score)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message "Aucun résultat" */}
      {showDropdown && !isLoading && value.length >= 3 && suggestions.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute z-50 w-full mt-2 bg-surface border border-border rounded-lg p-4 text-center"
        >
          <p className="text-text-muted text-sm">
            Aucune adresse trouvée pour "{value}"
          </p>
          <p className="text-text-muted text-xs mt-1">
            Assurez-vous d'entrer une adresse valide en France
          </p>
        </motion.div>
      )}

      {/* Aide pour l'utilisateur */}
      {!value && !error && (
        <p className="mt-1 text-text-muted text-xs">
          Commencez à taper (min. 3 caractères) : numéro, rue, code postal ou ville
        </p>
      )}
    </div>
  );
};

export default AddressAutocomplete;
