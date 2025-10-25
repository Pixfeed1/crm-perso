// src/pages/Quotes.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFileText, FiPlus, FiEdit2, FiTrash2, FiEye, FiSend, FiCheck, FiX, FiClock } from 'react-icons/fi';
import { quotesAPI } from '../services/quotesAPI';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import QuoteForm from '../components/quotes/QuoteForm';
import ConfirmModal from '../components/common/ConfirmModal';

const Quotes = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [quotes, setQuotes] = useState([]);
  const [filteredQuotes, setFilteredQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Chargement des devis
  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async () => {
    setIsLoading(true);
    try {
      const data = await quotesAPI.getAll();
      setQuotes(data);
      setFilteredQuotes(data);
    } catch (error) {
      console.error('Erreur lors du chargement des devis:', error);
      toast.error('Erreur lors du chargement des devis');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrage
  useEffect(() => {
    let filtered = quotes;

    // Filtre par recherche
    if (searchTerm) {
      filtered = filtered.filter(quote =>
        quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(quote => quote.status === statusFilter);
    }

    setFilteredQuotes(filtered);
  }, [searchTerm, statusFilter, quotes]);

  // Créer/Modifier devis
  const handleSaveQuote = async (quoteData) => {
    try {
      if (selectedQuote) {
        await quotesAPI.update(selectedQuote.id, quoteData);
        toast.success('Devis modifié avec succès');
      } else {
        await quotesAPI.create(quoteData);
        toast.success('Devis créé avec succès');
      }
      setIsFormOpen(false);
      setSelectedQuote(null);
      fetchQuotes();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde du devis');
    }
  };

  // Supprimer devis
  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Supprimer le devis',
      message: 'Êtes-vous sûr de vouloir supprimer ce devis ?',
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });

    if (confirmed) {
      try {
        await quotesAPI.delete(id);
        toast.success('Devis supprimé avec succès');
        fetchQuotes();
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        toast.error('Erreur lors de la suppression du devis');
      }
    }
  };

  // Changer le statut
  const handleStatusChange = async (id, newStatus) => {
    try {
      await quotesAPI.updateStatus(id, newStatus);
      toast.success('Statut mis à jour');
      fetchQuotes();
    } catch (error) {
      console.error('Erreur lors du changement de statut:', error);
      toast.error('Erreur lors du changement de statut');
    }
  };

  // Badge de statut
  const getStatusBadge = (status) => {
    const badges = {
      draft: { color: 'bg-gray-500/20 text-gray-300', icon: FiEdit2, label: 'Brouillon' },
      sent: { color: 'bg-blue-500/20 text-blue-300', icon: FiSend, label: 'Envoyé' },
      accepted: { color: 'bg-green-500/20 text-green-300', icon: FiCheck, label: 'Accepté' },
      rejected: { color: 'bg-red-500/20 text-red-300', icon: FiX, label: 'Refusé' },
      expired: { color: 'bg-orange-500/20 text-orange-300', icon: FiClock, label: 'Expiré' }
    };

    const badge = badges[status] || badges.draft;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  // Formater la date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  // Formater le montant
  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
            Devis
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {filteredQuotes.length} devis
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedQuote(null);
            setIsFormOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <FiPlus />
          <span>Nouveau devis</span>
        </button>
      </div>

      {/* Filtres */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <input
          type="text"
          placeholder="Rechercher par numéro ou client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="sent">Envoyé</option>
          <option value="accepted">Accepté</option>
          <option value="rejected">Refusé</option>
          <option value="expired">Expiré</option>
        </select>
      </div>

      {/* Liste des devis */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">
          Chargement...
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 rounded-lg border border-gray-700/50">
          <FiFileText className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">Aucun devis trouvé</p>
        </div>
      ) : (
        <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr className="text-left text-sm text-gray-400">
                  <th className="px-4 py-3">Numéro</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Montant TTC</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filteredQuotes.map((quote) => (
                  <motion.tr
                    key={quote.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-indigo-300">
                      {quote.quote_number}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {quote.client_name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {formatDate(quote.issue_date)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {formatAmount(quote.total_ttc)}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(quote.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedQuote(quote);
                            setIsFormOpen(true);
                          }}
                          className="p-2 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                          title="Modifier"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(quote.id)}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          title="Supprimer"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal formulaire */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setIsFormOpen(false);
              setSelectedQuote(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-gray-900 rounded-lg border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <QuoteForm
                quote={selectedQuote}
                onSave={handleSaveQuote}
                onCancel={() => {
                  setIsFormOpen(false);
                  setSelectedQuote(null);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState} />
    </div>
  );
};

export default Quotes;
