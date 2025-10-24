// frontend/src/components/quotes/QuoteDetails.jsx

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DocumentTextIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  PencilIcon,
  TrashIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import api from '../../utils/api';
import usePermissions from '../../hooks/usePermissions';

/**
 * Page de détails d'un devis avec actions selon le statut
 */
const QuoteDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadQuote();
  }, [id]);

  const loadQuote = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/quotes/${id}`);
      setQuote(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement du devis:', error);
      alert('Erreur lors du chargement du devis');
      navigate('/quotes');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!confirm('Marquer ce devis comme envoyé ?')) return;

    try {
      setActionLoading(true);
      await api.post(`/api/quotes/${id}/send`);
      alert('Devis marqué comme envoyé');
      loadQuote();
    } catch (error) {
      console.error('Erreur:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!confirm('Accepter ce devis ?')) return;

    try {
      setActionLoading(true);
      await api.post(`/api/quotes/${id}/accept`);
      alert('Devis accepté');
      loadQuote();
    } catch (error) {
      console.error('Erreur:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'acceptation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Rejeter ce devis ?')) return;

    try {
      setActionLoading(true);
      await api.post(`/api/quotes/${id}/reject`);
      alert('Devis rejeté');
      loadQuote();
    } catch (error) {
      console.error('Erreur:', error);
      alert(error.response?.data?.message || 'Erreur lors du rejet');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvertToProject = async () => {
    if (!confirm('Convertir ce devis en projet ?')) return;

    try {
      setActionLoading(true);
      const response = await api.post(`/api/quotes/${id}/convert-to-project`);
      alert('Devis converti en projet avec succès');
      navigate(`/projects/${response.data.project.id}`);
    } catch (error) {
      console.error('Erreur:', error);
      alert(error.response?.data?.message || 'Erreur lors de la conversion');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setActionLoading(true);
      const response = await api.get(`/api/quotes/${id}/pdf`, {
        responseType: 'blob'
      });

      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${quote.quote_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors du téléchargement du PDF');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Supprimer ce devis ? Cette action est irréversible.')) return;

    try {
      setActionLoading(true);
      await api.delete(`/api/quotes/${id}`);
      alert('Devis supprimé');
      navigate('/quotes');
    } catch (error) {
      console.error('Erreur:', error);
      alert(error.response?.data?.message || 'Erreur lors de la suppression');
    } finally {
      setActionLoading(false);
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement du devis...</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center p-12">
        <p className="text-gray-400">Devis non trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl
                 rounded-2xl border border-white/10 p-6"
      >
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
              <DocumentTextIcon className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{quote.title}</h1>
              <div className="flex items-center gap-4">
                <p className="text-gray-400 font-mono">{quote.quote_number}</p>
                {getStatusBadge(quote.status)}
              </div>
            </div>
          </div>
        </div>

        {/* Informations client et dates */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Client */}
          {quote.lead_name && (
            <div className="flex items-start gap-3">
              <UserIcon className="h-5 w-5 text-indigo-400 mt-1" />
              <div>
                <p className="text-sm text-gray-400">Client</p>
                <p className="text-white font-medium">{quote.lead_name}</p>
                {quote.lead_company && (
                  <p className="text-sm text-gray-400">{quote.lead_company}</p>
                )}
              </div>
            </div>
          )}

          {/* Date de création */}
          <div className="flex items-start gap-3">
            <CalendarIcon className="h-5 w-5 text-indigo-400 mt-1" />
            <div>
              <p className="text-sm text-gray-400">Créé le</p>
              <p className="text-white font-medium">
                {new Date(quote.created_at).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>

          {/* Valable jusqu'au */}
          <div className="flex items-start gap-3">
            <CalendarIcon className="h-5 w-5 text-rose-400 mt-1" />
            <div>
              <p className="text-sm text-gray-400">Valable jusqu'au</p>
              <p className="text-white font-medium">
                {new Date(quote.valid_until).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Lignes du devis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl
                 rounded-2xl border border-white/10 p-6"
      >
        <h2 className="text-xl font-bold text-white mb-4">Détails du devis</h2>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">
                  Quantité
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">
                  Prix U. HT
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">
                  Total HT
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {quote.items && quote.items.map((item, index) => (
                <tr key={index} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white">{item.description}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{item.unit_price.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {item.total_price.toFixed(2)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totaux */}
        <div className="mt-6 space-y-3 max-w-md ml-auto">
          <div className="flex justify-between items-center px-4 py-2 bg-white/5 rounded-lg">
            <span className="text-gray-300 font-medium">Sous-total HT</span>
            <span className="text-white font-semibold">{quote.subtotal.toFixed(2)} €</span>
          </div>

          <div className="flex justify-between items-center px-4 py-2 bg-white/5 rounded-lg">
            <span className="text-gray-300 font-medium">TVA ({quote.tax_rate}%)</span>
            <span className="text-white font-semibold">{quote.tax_amount.toFixed(2)} €</span>
          </div>

          <div className="flex justify-between items-center px-4 py-3
                        bg-gradient-to-r from-indigo-500/20 to-purple-500/20
                        border border-indigo-500/30 rounded-lg">
            <span className="text-white font-bold text-lg">Total TTC</span>
            <span className="text-white font-bold text-xl">{quote.total_amount.toFixed(2)} €</span>
          </div>
        </div>
      </motion.div>

      {/* Notes et conditions */}
      {(quote.notes || quote.terms) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl
                   rounded-2xl border border-white/10 p-6 space-y-4"
        >
          {quote.notes && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Notes</h3>
              <p className="text-gray-300 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {quote.terms && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Conditions générales</h3>
              <p className="text-gray-300 whitespace-pre-wrap">{quote.terms}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap items-center gap-4"
      >
        {/* Actions selon le statut */}
        {quote.status === 'draft' && hasPermission('update') && (
          <>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2
                       bg-gradient-to-r from-blue-500 to-cyan-500
                       hover:from-blue-600 hover:to-cyan-600
                       text-white font-medium rounded-lg
                       shadow-lg shadow-blue-500/25
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
              Marquer comme envoyé
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/quotes/edit/${id}`)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2
                       bg-white/10 hover:bg-white/20
                       border border-white/20
                       text-white font-medium rounded-lg
                       transition-all"
            >
              <PencilIcon className="h-5 w-5" />
              Modifier
            </motion.button>
          </>
        )}

        {quote.status === 'sent' && hasPermission('update') && (
          <>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAccept}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2
                       bg-gradient-to-r from-emerald-500 to-green-500
                       hover:from-emerald-600 hover:to-green-600
                       text-white font-medium rounded-lg
                       shadow-lg shadow-emerald-500/25
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
            >
              <CheckCircleIcon className="h-5 w-5" />
              Accepter
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleReject}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2
                       bg-gradient-to-r from-rose-500 to-red-500
                       hover:from-rose-600 hover:to-red-600
                       text-white font-medium rounded-lg
                       shadow-lg shadow-rose-500/25
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
            >
              <XCircleIcon className="h-5 w-5" />
              Rejeter
            </motion.button>
          </>
        )}

        {quote.status === 'accepted' && hasPermission('create') && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleConvertToProject}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2
                     bg-gradient-to-r from-indigo-500 to-purple-500
                     hover:from-indigo-600 hover:to-purple-600
                     text-white font-medium rounded-lg
                     shadow-lg shadow-indigo-500/25
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Convertir en projet
          </motion.button>
        )}

        {/* Télécharger PDF (toujours disponible) */}
        {hasPermission('read') && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownloadPDF}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2
                     bg-white/10 hover:bg-white/20
                     border border-white/20
                     text-white font-medium rounded-lg
                     transition-all"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            Télécharger PDF
          </motion.button>
        )}

        {/* Supprimer (seulement brouillon ou rejeté) */}
        {['draft', 'rejected'].includes(quote.status) && hasPermission('delete') && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDelete}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2
                     bg-rose-500/10 hover:bg-rose-500/20
                     border border-rose-500/30
                     text-rose-300 font-medium rounded-lg
                     transition-all ml-auto"
          >
            <TrashIcon className="h-5 w-5" />
            Supprimer
          </motion.button>
        )}
      </motion.div>
    </div>
  );
};

export default QuoteDetails;
