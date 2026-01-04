// src/components/common/EmailAutocomplete.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FiUser, FiBriefcase, FiUsers } from 'react-icons/fi';
import { searchAPI } from '../../services/api';

const EmailAutocomplete = ({
  value,
  onChange,
  placeholder = "email@exemple.com",
  className = ""
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceRef = useRef(null);

  // Fermer les suggestions si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Rechercher les contacts quand l'utilisateur tape
  const searchContacts = async (query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const results = await searchAPI.global(query);

      // Combiner tous les contacts avec emails
      const allSuggestions = [];

      // Clients
      if (results.clients) {
        results.clients.forEach(client => {
          if (client.email) {
            allSuggestions.push({
              id: `client-${client.id}`,
              type: 'client',
              name: client.name || client.company,
              company: client.company,
              email: client.email,
              icon: FiBriefcase
            });
          }
        });
      }

      // Leads
      if (results.leads) {
        results.leads.forEach(lead => {
          if (lead.email) {
            allSuggestions.push({
              id: `lead-${lead.id}`,
              type: 'lead',
              name: lead.name || lead.company,
              company: lead.company,
              email: lead.email,
              icon: FiUsers
            });
          }
        });
      }

      // Contacts
      if (results.contacts) {
        results.contacts.forEach(contact => {
          if (contact.email) {
            allSuggestions.push({
              id: `contact-${contact.id}`,
              type: 'contact',
              name: contact.name,
              company: contact.lead_name,
              email: contact.email,
              position: contact.position,
              icon: FiUser
            });
          }
        });
      }

      // Dédupliquer par email
      const uniqueEmails = new Map();
      allSuggestions.forEach(s => {
        if (!uniqueEmails.has(s.email)) {
          uniqueEmails.set(s.email, s);
        }
      });

      setSuggestions(Array.from(uniqueEmails.values()).slice(0, 8));
      setShowSuggestions(true);
    } catch (error) {
      console.error('Erreur lors de la recherche de contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);

    // Debounce la recherche
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchContacts(newValue);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion) => {
    onChange(suggestion.email);
    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'client': return 'Client';
      case 'lead': return 'Lead';
      case 'contact': return 'Contact';
      default: return '';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'client': return 'text-green-400 bg-green-500/20';
      case 'lead': return 'text-blue-400 bg-blue-500/20';
      case 'contact': return 'text-purple-400 bg-purple-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="email"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
        placeholder={placeholder}
        className={className || "w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"}
        autoComplete="off"
      />

      {/* Loading indicator */}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-700/50 transition-colors text-left ${
                  index === selectedIndex ? 'bg-gray-700/50' : ''
                } ${index > 0 ? 'border-t border-gray-700/50' : ''}`}
              >
                <div className={`p-2 rounded-lg ${getTypeColor(suggestion.type)}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">
                      {suggestion.name}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeColor(suggestion.type)}`}>
                      {getTypeLabel(suggestion.type)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 truncate">
                    {suggestion.email}
                  </div>
                  {suggestion.company && (
                    <div className="text-xs text-gray-500 truncate">
                      {suggestion.company}
                      {suggestion.position && ` • ${suggestion.position}`}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EmailAutocomplete;
