// frontend/src/pages/Quotes.jsx

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  DocumentTextIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import usePermissions from '../hooks/usePermissions';

/**
 * Page principale des devis avec liste, filtres et recherche
 */
const Quotes = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [quotes, setQuotes] = useState([]);
  const [filteredQuotes, setFilteredQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadQuotes();
  }, []);

  useEffect(() => {
    filterQuotes();
  }, [quotes, searchTerm, statusFilter]);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/quotes');
      setQuotes(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des devis:', error);
      alert('Erreur lors du chargement des devis');
    } finally {
      setLoading(false);
    }
  };

  const filterQuotes = () => {
    let filtered = [...quotes];

    // Filtrer par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(quote => quote.status === statusFilter);
    }

    // Filtrer par recherche
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(quote =>
        quote.quote_number.toLowerCase().includes(term) ||
        quote.title.toLowerCase().includes(term) ||
        (quote.lead_name && quote.lead_name.toLowerCase().includes(term)) ||
        (quote.lead_company && quote.lead_company.toLowerCase().includes(term))
      );
    }

    setFilteredQuotes(filtered);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Brouillon', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
      sent: { label: 'Envoyé', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
      accepted: { label: 'Accepté', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
      rejected: { label: 'Rejeté', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
      converted: { label: 'Converti', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' }
    };

    const config = statusConfig[status] || statusConfig.draft;

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium border ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getStatusCounts = () => {
    return {
      all: quotes.length,
      draft: quotes.filter(q => q.status === 'draft').length,
      sent: quotes.filter(q => q.status === 'sent').length,
      accepted: quotes.filter(q => q.status === 'accepted').length,
      rejected: quotes.filter(q => q.status === 'rejected').length,
      converted: quotes.filter(q => q.status === 'converted').length
    };
  };

  const counts = getStatusCounts();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement des devis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
            <DocumentTextIcon className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Devis</h1>
            <p className="text-gray-400">Gérez vos devis et propositions commerciales</p>
          </div>
        </div>

        {hasPermission('create') && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/quotes/new')}
            className="flex items-center gap-2 px-6 py-3
                     bg-gradient-to-r from-indigo-500 to-purple-500
                     hover:from-indigo-600 hover:to-purple-600
                     text-white font-medium rounded-lg
                     shadow-lg shadow-indigo-500/25
                     transition-all"
          >
            <PlusIcon className="h-5 w-5" />
            Nouveau devis
          </motion.button>
        )}
      </motion.div>

      {/* Filtres et recherche */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl
                 rounded-2xl border border-white/10 p-6"
      >
        {/* Barre de recherche */}
        <div className="mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par numéro, titre, client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg
                       text-white placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent
                       transition-all"
            />
          </div>
        </div>

        {/* Filtres par statut */}
        <div className="flex items-center gap-2 flex-wrap">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <span className="text-sm text-gray-400 mr-2">Filtrer par statut:</span>

          {[
            { value: 'all', label: 'Tous', count: counts.all },
            { value: 'draft', label: 'Brouillons', count: counts.draft },
            { value: 'sent', label: 'Envoyés', count: counts.sent },
            { value: 'accepted', label: 'Acceptés', count: counts.accepted },
            { value: 'rejected', label: 'Rejetés', count: counts.rejected },
            { value: 'converted', label: 'Convertis', count: counts.converted }
          ].map(filter => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-4 py-2 rounded-lg font-medium transition-all
                       ${statusFilter === filter.value
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>
      </motion.div>

      {/* Liste des devis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl
                 rounded-2xl border border-white/10 overflow-hidden"
      >
        {filteredQuotes.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">Aucun devis trouvé</p>
            {searchTerm && (
              <p className="text-sm text-gray-500">
                Essayez de modifier votre recherche ou vos filtres
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20">
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Numéro
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Titre
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Montant TTC
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence mode="popLayout">
                  {filteredQuotes.map((quote) => (
                    <motion.tr
                      key={quote.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => navigate(`/quotes/${quote.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-indigo-400 font-mono font-medium">
                          {quote.quote_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-white font-medium">{quote.title}</span>
                      </td>
                      <td className="px-6 py-4">
                        {quote.lead_name ? (
                          <div>
                            <p className="text-white">{quote.lead_name}</p>
                            {quote.lead_company && (
                              <p className="text-sm text-gray-400">{quote.lead_company}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-white font-semibold">
                          {quote.total_amount.toFixed(2)} €
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(quote.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-gray-300">
                          {new Date(quote.created_at).toLocaleDateString('fr-FR')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/quotes/${quote.id}`);
                            }}
                            className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10
                                     rounded-lg transition-all"
                            title="Voir les détails"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </motion.button>

                          {quote.status === 'draft' && hasPermission('update') && (
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/quotes/edit/${quote.id}`);
                              }}
                              className="p-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10
                                       rounded-lg transition-all"
                              title="Modifier"
                            >
                              <PencilIcon className="h-5 w-5" />
                            </motion.button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Statistiques */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-xl
                      rounded-xl border border-blue-500/20 p-4">
          <p className="text-sm text-blue-300 mb-1">Total devis</p>
          <p className="text-2xl font-bold text-white">{quotes.length}</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 backdrop-blur-xl
                      rounded-xl border border-emerald-500/20 p-4">
          <p className="text-sm text-emerald-300 mb-1">Acceptés</p>
          <p className="text-2xl font-bold text-white">{counts.accepted}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl
                      rounded-xl border border-purple-500/20 p-4">
          <p className="text-sm text-purple-300 mb-1">Convertis</p>
          <p className="text-2xl font-bold text-white">{counts.converted}</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 backdrop-blur-xl
                      rounded-xl border border-indigo-500/20 p-4">
          <p className="text-sm text-indigo-300 mb-1">Montant total</p>
          <p className="text-2xl font-bold text-white">
            {quotes.reduce((sum, q) => sum + q.total_amount, 0).toFixed(2)} €
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Quotes;
