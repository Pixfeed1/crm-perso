// src/components/leads/ContactClientModal.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiUser, FiLink, FiX } from 'react-icons/fi';
import api from '../../services/api';

const ContactClientModal = ({ contact, leadId, onClose, onCreateClient, onLinkClient }) => {
  const [mode, setMode] = useState('create'); // 'create' ou 'link'
  const [loading, setLoading] = useState(false);
  const [existingClients, setExistingClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');

  // Formulaire pour créer un nouveau client
  const [formData, setFormData] = useState({
    name: contact.name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    notes: `Créé depuis le contact: ${contact.name}${contact.position ? ' (' + contact.position + ')' : ''}`
  });

  // Charger les clients existants
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await api.get('/clients');
        // Filtrer uniquement les clients particuliers
        const individualClients = response.data.filter(client => client.type === 'individual');
        setExistingClients(individualClients);
      } catch (error) {
        console.error('Erreur lors de la récupération des clients:', error);
      }
    };

    if (mode === 'link') {
      fetchClients();
    }
  }, [mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'create') {
        // Créer un nouveau client depuis le contact
        const response = await api.post(
          `/leads/${leadId}/contacts/${contact.id}/create-client`,
          formData
        );

        if (onCreateClient) {
          onCreateClient(response.data);
        }

        alert('Client créé et lié au contact avec succès !');
        onClose();
      } else {
        // Lier à un client existant
        if (!selectedClientId) {
          alert('Veuillez sélectionner un client');
          setLoading(false);
          return;
        }

        const response = await api.post(
          `/leads/${leadId}/contacts/${contact.id}/link-client`,
          { clientId: parseInt(selectedClientId) }
        );

        if (onLinkClient) {
          onLinkClient(response.data);
        }

        alert('Contact lié au client avec succès !');
        onClose();
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(error.response?.data?.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-white">Profil Client Particulier</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Info du contact */}
        <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-800 flex items-center justify-center text-lg font-medium text-white border border-indigo-700">
              {contact.name.charAt(0)}
            </div>
            <div>
              <h4 className="font-medium text-white">{contact.name}</h4>
              {contact.position && (
                <p className="text-sm text-indigo-300">{contact.position}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sélecteur de mode */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              mode === 'create'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <FiUser size={16} />
            Créer nouveau client
          </button>
          <button
            type="button"
            onClick={() => setMode('link')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              mode === 'link'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <FiLink size={16} />
            Lier à un client existant
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' ? (
            <>
              {/* Mode: Créer un nouveau client */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Téléphone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows="3"
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </>
          ) : (
            <>
              {/* Mode: Lier à un client existant */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sélectionner un client particulier <span className="text-rose-400">*</span>
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Sélectionner un client --</option>
                  {existingClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} {client.email ? `(${client.email})` : ''}
                    </option>
                  ))}
                </select>
                {existingClients.length === 0 && mode === 'link' && (
                  <p className="text-sm text-gray-400 mt-2">
                    Aucun client particulier trouvé. Créez-en un nouveau.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Boutons d'action */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-700 text-white hover:bg-gray-800 font-medium transition-all"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                mode === 'create'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? 'En cours...' : mode === 'create' ? 'Créer et lier' : 'Lier'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default ContactClientModal;
