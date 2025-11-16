// src/pages/Quotes.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFileText, FiPlus, FiEdit2, FiTrash2, FiEye, FiSend, FiCheck, FiX, FiClock, FiDownload } from 'react-icons/fi';
import { quotesAPI } from '../services/quotesAPI';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import QuoteForm from '../components/quotes/QuoteForm';
import ConfirmModal from '../components/common/ConfirmModal';
import SendEmailModal from '../components/common/SendEmailModal';
import Button from '../components/common/Button';
import { exportQuoteToPDF } from '../services/exportPDF';

const Quotes = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [quotes, setQuotes] = useState([]);
  const [filteredQuotes, setFilteredQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewingQuote, setIsViewingQuote] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [quoteToSend, setQuoteToSend] = useState(null);

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

  // Envoyer devis par email
  const handleSendEmail = (quote) => {
    setQuoteToSend(quote);
    setEmailModalOpen(true);
  };

  const handleEmailSend = async (emailData) => {
    try {
      await quotesAPI.sendEmail(quoteToSend.id, emailData);
      toast.success('Devis envoyé avec succès');
      fetchQuotes(); // Rafraîchir pour mettre à jour le statut
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      throw new Error(error.message || 'Erreur lors de l\'envoi de l\'email');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto w-full">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pt-16 sm:pt-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
              Devis
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {filteredQuotes.length} devis
            </p>
          </div>

          <Button
            onClick={() => {
              setSelectedQuote(null);
              setIsFormOpen(true);
            }}
            variant="primary"
            icon={FiPlus}
            className="w-full sm:w-auto"
          >
            Nouveau devis
          </Button>
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
                              setIsViewingQuote(true);
                            }}
                            className="p-2 text-purple-400 hover:bg-purple-500/20 rounded transition-colors"
                            title="Voir le devis"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSendEmail(quote)}
                            className="p-2 text-indigo-400 hover:bg-indigo-500/20 rounded transition-colors"
                            title="Envoyer par email"
                          >
                            <FiSend className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => exportQuoteToPDF(quote)}
                            className="p-2 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                            title="Télécharger PDF"
                          >
                            <FiDownload className="w-4 h-4" />
                          </button>
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
      </div>

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

      {/* Modal de visualisation avec aperçu PDF */}
      <AnimatePresence>
        {isViewingQuote && selectedQuote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setIsViewingQuote(false);
              setSelectedQuote(null);
            }}
          >
            {/* Barre d'actions flottante */}
            <div className="fixed top-4 right-4 z-[60] flex gap-3">
              <Button
                onClick={() => exportQuoteToPDF(selectedQuote)}
                variant="primary"
                icon={FiDownload}
              >
                Télécharger PDF
              </Button>
              <button
                onClick={() => {
                  setIsViewingQuote(false);
                  setSelectedQuote(null);
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-lg transition-colors"
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Document PDF preview */}
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              style={{
                aspectRatio: '1/1.414', // Format A4
                maxHeight: '90vh'
              }}
            >
              {/* Contenu du PDF */}
              <div className="p-12 text-gray-900">
                {/* En-tête */}
                <div className="flex justify-between items-start mb-12 pb-6 border-b-2 border-indigo-600">
                  <div>
                    <h1 className="text-4xl font-bold text-indigo-600 mb-2">DEVIS</h1>
                    <p className="text-sm text-gray-600">N° {selectedQuote.quote_number}</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Votre Entreprise</h2>
                    <p className="text-sm text-gray-600">123 Rue Example</p>
                    <p className="text-sm text-gray-600">75001 Paris</p>
                    <p className="text-sm text-gray-600">contact@entreprise.fr</p>
                  </div>
                </div>

                {/* Informations client et date */}
                <div className="grid grid-cols-2 gap-8 mb-12">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Client</h3>
                    <p className="text-lg font-semibold text-gray-900">{selectedQuote.client_name}</p>
                    {selectedQuote.client_email && (
                      <p className="text-sm text-gray-600">{selectedQuote.client_email}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Date d'émission</h3>
                    <p className="text-lg font-semibold text-gray-900">{formatDate(selectedQuote.issue_date)}</p>
                    {selectedQuote.valid_until && (
                      <>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase mt-4 mb-2">Valable jusqu'au</h3>
                        <p className="text-lg font-semibold text-gray-900">{formatDate(selectedQuote.valid_until)}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Tableau des articles */}
                {selectedQuote.items && selectedQuote.items.length > 0 && (
                  <div className="mb-12">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-indigo-600 text-white">
                          <th className="px-4 py-3 text-left font-semibold">Description</th>
                          <th className="px-4 py-3 text-center font-semibold w-24">Qté</th>
                          <th className="px-4 py-3 text-right font-semibold w-32">P.U. HT</th>
                          <th className="px-4 py-3 text-right font-semibold w-32">Total HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedQuote.items.map((item, index) => (
                          <tr key={index} className="border-b border-gray-200">
                            <td className="px-4 py-3 text-gray-900">{item.description}</td>
                            <td className="px-4 py-3 text-center text-gray-700">{item.quantity}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{formatAmount(item.unit_price)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900">
                              {formatAmount(item.quantity * item.unit_price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Totaux */}
                <div className="flex justify-end mb-12">
                  <div className="w-80">
                    <div className="bg-gray-50 p-6 rounded-lg">
                      <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-200">
                        <span className="text-gray-700 font-medium">Total HT</span>
                        <span className="text-gray-900 font-semibold text-lg">{formatAmount(selectedQuote.total_ht)}</span>
                      </div>
                      <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-200">
                        <span className="text-gray-700 font-medium">TVA (20%)</span>
                        <span className="text-gray-900 font-semibold text-lg">{formatAmount(selectedQuote.total_tva)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-3 bg-indigo-600 -m-6 mt-0 p-6 rounded-b-lg">
                        <span className="text-white font-bold text-lg">Total TTC</span>
                        <span className="text-white font-bold text-2xl">{formatAmount(selectedQuote.total_ttc)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conditions */}
                <div className="border-t-2 border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Conditions</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Devis valable 30 jours. Acompte de 30% à la commande.
                    Paiement du solde à la livraison. Conditions générales de vente disponibles sur demande.
                  </p>
                </div>

                {/* Pied de page */}
                <div className="mt-8 pt-6 border-t border-gray-200 text-center">
                  <p className="text-xs text-gray-500">
                    Votre Entreprise - SIRET: 123 456 789 00012 - TVA: FR12 123456789
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState} />

      {/* Modal d'envoi email */}
      <SendEmailModal
        isOpen={emailModalOpen}
        onClose={() => {
          setEmailModalOpen(false);
          setQuoteToSend(null);
        }}
        onSend={handleEmailSend}
        defaultEmail={quoteToSend?.client_email || ''}
        documentType="devis"
        documentNumber={quoteToSend?.quote_number || ''}
        clientName={quoteToSend?.client_name || ''}
      />
    </div>
  );
};

export default Quotes;
