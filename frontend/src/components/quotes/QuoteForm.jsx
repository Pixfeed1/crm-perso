// frontend/src/components/quotes/QuoteForm.jsx

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  DocumentTextIcon,
  XMarkIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import QuoteItemsEditor from './QuoteItemsEditor';
import api from '../../utils/api';

/**
 * Formulaire de création/édition d'un devis
 */
const QuoteForm = ({ quoteId = null, onSuccess }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [formData, setFormData] = useState({
    lead_id: '',
    title: '',
    items: [
      {
        description: '',
        quantity: 1,
        unit_price: 0,
        total_price: 0
      }
    ],
    notes: '',
    terms: 'Devis valable 30 jours. Paiement à réception de facture. TVA non applicable, art. 293 B du CGI.',
    valid_until: getDefaultValidUntil()
  });
  const [errors, setErrors] = useState({});

  // Date par défaut : 30 jours
  function getDefaultValidUntil() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  }

  // Charger les leads pour le sélecteur
  useEffect(() => {
    loadLeads();
    if (quoteId) {
      loadQuote();
    }
  }, [quoteId]);

  const loadLeads = async () => {
    try {
      const response = await api.get('/api/leads');
      setLeads(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des leads:', error);
    }
  };

  const loadQuote = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/quotes/${quoteId}`);
      const quote = response.data;

      setFormData({
        lead_id: quote.lead_id || '',
        title: quote.title,
        items: quote.items || [],
        notes: quote.notes || '',
        terms: quote.terms || formData.terms,
        valid_until: quote.valid_until || getDefaultValidUntil()
      });
    } catch (error) {
      console.error('Erreur lors du chargement du devis:', error);
      alert('Erreur lors du chargement du devis');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Effacer l'erreur du champ
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Le titre est requis';
    }

    if (formData.items.length === 0) {
      newErrors.items = 'Au moins une ligne est requise';
    }

    // Vérifier que toutes les lignes ont une description
    const invalidItems = formData.items.filter(item => !item.description.trim());
    if (invalidItems.length > 0) {
      newErrors.items = 'Toutes les lignes doivent avoir une description';
    }

    if (!formData.valid_until) {
      newErrors.valid_until = 'La date de validité est requise';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      const quoteData = {
        ...formData,
        lead_id: formData.lead_id || null
      };

      if (quoteId) {
        // Mise à jour
        await api.put(`/api/quotes/${quoteId}`, quoteData);
        alert('Devis mis à jour avec succès');
      } else {
        // Création
        await api.post('/api/quotes', quoteData);
        alert('Devis créé avec succès');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/quotes');
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du devis:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'enregistrement du devis');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onSuccess) {
      onSuccess();
    } else {
      navigate('/quotes');
    }
  };

  if (loading && quoteId) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement du devis...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      {/* En-tête */}
      <div className="flex items-center gap-3 pb-6 border-b border-white/10">
        <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
          <DocumentTextIcon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">
            {quoteId ? 'Modifier le devis' : 'Nouveau devis'}
          </h2>
          <p className="text-gray-400 text-sm">
            Remplissez les informations du devis
          </p>
        </div>
      </div>

      {/* Client (Lead) */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Client (optionnel)
        </label>
        <select
          value={formData.lead_id}
          onChange={(e) => handleChange('lead_id', e.target.value)}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg
                   text-white
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent
                   transition-all"
        >
          <option value="">Sélectionner un client</option>
          {leads.map(lead => (
            <option key={lead.id} value={lead.id}>
              {lead.name} {lead.company ? `(${lead.company})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Titre */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Titre du devis *
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Ex: Développement site web e-commerce"
          className={`w-full px-4 py-3 bg-white/5 border rounded-lg
                   text-white placeholder-gray-400
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent
                   transition-all
                   ${errors.title ? 'border-rose-500' : 'border-white/10'}`}
        />
        {errors.title && (
          <p className="mt-1 text-sm text-rose-400">{errors.title}</p>
        )}
      </div>

      {/* Date de validité */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Valable jusqu'au *
        </label>
        <input
          type="date"
          value={formData.valid_until}
          onChange={(e) => handleChange('valid_until', e.target.value)}
          className={`w-full px-4 py-3 bg-white/5 border rounded-lg
                   text-white
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent
                   transition-all
                   ${errors.valid_until ? 'border-rose-500' : 'border-white/10'}`}
        />
        {errors.valid_until && (
          <p className="mt-1 text-sm text-rose-400">{errors.valid_until}</p>
        )}
      </div>

      {/* Lignes du devis */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-4">
          Lignes du devis *
        </label>
        <QuoteItemsEditor
          items={formData.items}
          onChange={(items) => handleChange('items', items)}
        />
        {errors.items && (
          <p className="mt-2 text-sm text-rose-400">{errors.items}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Notes (optionnel)
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Informations complémentaires..."
          rows={3}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg
                   text-white placeholder-gray-400
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent
                   transition-all resize-none"
        />
      </div>

      {/* Conditions */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Conditions générales
        </label>
        <textarea
          value={formData.terms}
          onChange={(e) => handleChange('terms', e.target.value)}
          rows={3}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg
                   text-white
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent
                   transition-all resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 pt-6 border-t border-white/10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3
                   bg-gradient-to-r from-indigo-500 to-purple-500
                   hover:from-indigo-600 hover:to-purple-600
                   text-white font-medium rounded-lg
                   shadow-lg shadow-indigo-500/25
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all"
        >
          <CheckIcon className="h-5 w-5" />
          {loading ? 'Enregistrement...' : quoteId ? 'Mettre à jour' : 'Créer le devis'}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3
                   bg-white/5 hover:bg-white/10
                   border border-white/10
                   text-gray-300 font-medium rounded-lg
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all"
        >
          <XMarkIcon className="h-5 w-5" />
          Annuler
        </motion.button>
      </div>
    </motion.form>
  );
};

export default QuoteForm;
